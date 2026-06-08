use crate::commands::capture_sound;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use image::{imageops::FilterType, ImageBuffer, ImageFormat, Rgba};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::io::Cursor;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use xcap::Monitor;

/// Holds the most recent capture so the preview window can fetch it after open.
#[derive(Default)]
pub struct LatestCapture(pub Mutex<Option<StoredCapture>>);

#[derive(Default)]
pub struct CaptureEditSessions(Mutex<CaptureEditSessionState>);

#[derive(Default)]
struct CaptureEditSessionState {
    next_id: u64,
    active: Option<CaptureEditSession>,
}

struct CaptureEditSession {
    id: u64,
    source: EditSource,
}

impl CaptureEditSessions {
    fn store(&self, source: EditSource) -> u64 {
        let mut sessions = self.0.lock().unwrap();
        sessions.next_id = sessions.next_id.wrapping_add(1);
        if sessions.next_id == 0 {
            sessions.next_id = 1;
        }
        let id = sessions.next_id;
        sessions.active = Some(CaptureEditSession { id, source });
        id
    }

    fn source_for(&self, id: u64) -> Option<EditSource> {
        let sessions = self.0.lock().unwrap();
        let active = sessions.active.as_ref()?;
        if active.id == id {
            Some(active.source.clone())
        } else {
            None
        }
    }
}

#[derive(Clone)]
pub struct StoredCapture {
    pub result: CaptureResult,
    pub rgba: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub edit_source: Option<EditSource>,
    /// Lazily-encoded data URL for the enlarged preview, cached so the (heavy)
    /// PNG encode happens once per capture rather than on every Space press.
    pub full_data_url: Option<String>,
    /// Lazily-encoded full-resolution data URL for the image editor, cached so
    /// re-opening the editor for the same capture skips the PNG encode.
    pub edit_data_url: Option<String>,
}

#[derive(Clone)]
pub struct EditSource {
    pub rgba: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub crop: EditRect,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    /// Fast preview data URL, ready to drop into an <img src>.
    pub data_url: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureEditResult {
    pub session_id: u64,
    pub data_url: String,
    pub width: u32,
    pub height: u32,
    pub crop: EditRect,
}

fn primary_monitor() -> Result<Monitor, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .ok_or_else(|| "No primary monitor found.".into())
}

fn push_u16(buf: &mut Vec<u8>, value: u16) {
    buf.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(buf: &mut Vec<u8>, value: u32) {
    buf.extend_from_slice(&value.to_le_bytes());
}

fn push_i32(buf: &mut Vec<u8>, value: i32) {
    buf.extend_from_slice(&value.to_le_bytes());
}

fn encode_bmp_preview(img: &ImageBuffer<Rgba<u8>, Vec<u8>>) -> Result<String, String> {
    let width = img.width();
    let height = img.height();
    let pixel_bytes = width
        .checked_mul(height)
        .and_then(|px| px.checked_mul(4))
        .ok_or_else(|| "Capture is too large.".to_string())?;
    let file_size = 14u32
        .checked_add(40)
        .and_then(|header| header.checked_add(pixel_bytes))
        .ok_or_else(|| "Capture is too large.".to_string())?;

    let mut buf = Vec::with_capacity(file_size as usize);
    buf.extend_from_slice(b"BM");
    push_u32(&mut buf, file_size);
    push_u16(&mut buf, 0);
    push_u16(&mut buf, 0);
    push_u32(&mut buf, 54);
    push_u32(&mut buf, 40);
    push_i32(&mut buf, width as i32);
    push_i32(&mut buf, -(height as i32));
    push_u16(&mut buf, 1);
    push_u16(&mut buf, 32);
    push_u32(&mut buf, 0);
    push_u32(&mut buf, pixel_bytes);
    push_i32(&mut buf, 2835);
    push_i32(&mut buf, 2835);
    push_u32(&mut buf, 0);
    push_u32(&mut buf, 0);

    for pixel in img.as_raw().chunks_exact(4) {
        buf.push(pixel[2]);
        buf.push(pixel[1]);
        buf.push(pixel[0]);
        buf.push(pixel[3]);
    }

    let data_url = format!("data:image/bmp;base64,{}", B64.encode(&buf));
    Ok(data_url)
}

/// GDI desktop captures on Windows 8+ leave the alpha channel undefined (xcap
/// only forces it opaque on older versions). The transparent pixels then blend
/// with the preview card background and produce semi-transparent saved files,
/// so force every pixel fully opaque.
pub fn force_opaque(img: &mut ImageBuffer<Rgba<u8>, Vec<u8>>) {
    for pixel in img.pixels_mut() {
        pixel.0[3] = 255;
    }
}

/// Downscale so the longest edge is at most `max_edge`, preserving aspect ratio.
/// Returns a clone untouched when already within bounds.
fn scale_to_max_edge(
    img: &ImageBuffer<Rgba<u8>, Vec<u8>>,
    max_edge: u32,
    filter: FilterType,
) -> ImageBuffer<Rgba<u8>, Vec<u8>> {
    let width = img.width();
    let height = img.height();
    let longest = width.max(height);
    if longest <= max_edge {
        return img.clone();
    }
    let scale = max_edge as f64 / longest as f64;
    let w = ((width as f64 * scale).round() as u32).max(1);
    let h = ((height as f64 * scale).round() as u32).max(1);
    image::imageops::resize(img, w, h, filter)
}

fn preview_image(img: &ImageBuffer<Rgba<u8>, Vec<u8>>) -> ImageBuffer<Rgba<u8>, Vec<u8>> {
    // Nearest is fine for the tiny 320px card thumbnail.
    scale_to_max_edge(img, 320, FilterType::Nearest)
}

pub fn make_stored_capture(img: &ImageBuffer<Rgba<u8>, Vec<u8>>) -> Result<StoredCapture, String> {
    let preview = preview_image(img);
    let result = CaptureResult {
        width: img.width(),
        height: img.height(),
        data_url: encode_bmp_preview(&preview)?,
    };

    Ok(StoredCapture {
        result,
        rgba: img.as_raw().clone(),
        width: img.width(),
        height: img.height(),
        edit_source: None,
        full_data_url: None,
        edit_data_url: None,
    })
}

fn latest_capture(latest: State<'_, LatestCapture>) -> Result<StoredCapture, String> {
    latest
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "No capture available.".into())
}

/// Data URL for the enlarged preview: the capture downscaled to at most
/// `ENLARGED_MAX_EDGE` (plenty crisp on screen, far lighter than a raw 4K PNG to
/// encode, transfer, and composite) and PNG-encoded.
fn enlarged_data_url(capture: &StoredCapture) -> Result<String, String> {
    const ENLARGED_MAX_EDGE: u32 = 2560;

    let img = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(
        capture.width,
        capture.height,
        capture.rgba.clone(),
    )
    .ok_or_else(|| "Latest capture pixels are invalid.".to_string())?;
    // Triangle keeps downscaled text/edges readable without Lanczos' cost.
    let scaled = scale_to_max_edge(&img, ENLARGED_MAX_EDGE, FilterType::Triangle);
    let mut buf = Vec::new();
    scaled
        .write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", B64.encode(&buf)))
}

fn encode_png_bytes(capture: &StoredCapture) -> Result<Vec<u8>, String> {
    let img = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(
        capture.width,
        capture.height,
        capture.rgba.clone(),
    )
    .ok_or_else(|| "Latest capture pixels are invalid.".to_string())?;
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(buf)
}

/// PNG data URL for the editor's *display* image. Uses fast (low-effort) zlib
/// compression with adaptive row filtering: filtering is cheap but shrinks a
/// screenshot several-fold, and the resulting bytes cross IPC and get base64'd,
/// so a smaller payload dominates the end-to-end open time far more than the
/// extra filtering CPU. (The save-to-desktop path keeps the default
/// high-compression encoder via `encode_png_bytes`.)
fn rgba_png_data_url(width: u32, height: u32, rgba: &[u8]) -> Result<String, String> {
    use image::codecs::png::{CompressionType, FilterType as PngFilterType, PngEncoder};
    use image::{ExtendedColorType, ImageEncoder};

    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|px| px.checked_mul(4));
    if expected != Some(rgba.len()) {
        return Err("Capture pixels are invalid.".into());
    }

    let mut buf = Vec::new();
    PngEncoder::new_with_quality(&mut buf, CompressionType::Fast, PngFilterType::Adaptive)
        .write_image(rgba, width, height, ExtendedColorType::Rgba8)
        .map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", B64.encode(&buf)))
}

pub fn perform_fullscreen_capture(app: &AppHandle) -> Result<CaptureResult, String> {
    let monitor = primary_monitor()?;
    let mut img = monitor.capture_image().map_err(|e| e.to_string())?;
    force_opaque(&mut img);
    let stored = make_stored_capture(&img)?;
    let result = stored.result.clone();
    *app.state::<LatestCapture>().0.lock().unwrap() = Some(stored);
    Ok(result)
}

#[tauri::command]
pub fn capture_fullscreen(app: AppHandle) -> Result<CaptureResult, String> {
    let result = perform_fullscreen_capture(&app)?;
    capture_sound::play_capture_sound(&app);
    Ok(result)
}

#[tauri::command]
pub fn capture_region(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    latest: State<'_, LatestCapture>,
) -> Result<CaptureResult, String> {
    if width == 0 || height == 0 {
        return Err("Region width/height must be > 0.".into());
    }

    let monitor = primary_monitor()?;
    let mut full = monitor.capture_image().map_err(|e| e.to_string())?;
    force_opaque(&mut full);

    let mw = full.width() as i32;
    let mh = full.height() as i32;
    let sx = x.max(0).min(mw);
    let sy = y.max(0).min(mh);
    let sw = ((x + width as i32).min(mw) - sx).max(0) as u32;
    let sh = ((y + height as i32).min(mh) - sy).max(0) as u32;

    if sw == 0 || sh == 0 {
        return Err("Region is outside the monitor bounds.".into());
    }

    let cropped = image::imageops::crop_imm(&full, sx as u32, sy as u32, sw, sh).to_image();
    let stored = make_stored_capture(&cropped)?;
    let result = stored.result.clone();
    *latest.0.lock().unwrap() = Some(stored);
    capture_sound::play_capture_sound(&app);
    Ok(result)
}

/// Fetched by the preview window after it opens.
#[tauri::command]
pub fn take_latest_capture(latest: State<'_, LatestCapture>) -> Option<CaptureResult> {
    latest
        .0
        .lock()
        .unwrap()
        .as_ref()
        .map(|capture| capture.result.clone())
}

/// Full-resolution capture as a PNG data URL, for the enlarged preview. The card
/// uses the cheap downscaled preview; the enlarged view fetches this on demand so
/// it stays crisp when scaled up.
#[tauri::command]
pub fn take_latest_capture_full(
    window: tauri::WebviewWindow,
    latest: State<'_, LatestCapture>,
) -> Result<CaptureResult, String> {
    crate::commands::require_window(
        &window,
        &["capture-zoom", "capture-preview", "image-editor", "main"],
    )?;
    let mut guard = latest.0.lock().unwrap();
    let capture = guard
        .as_mut()
        .ok_or_else(|| "No capture available.".to_string())?;
    if capture.full_data_url.is_none() {
        capture.full_data_url = Some(enlarged_data_url(capture)?);
    }
    Ok(CaptureResult {
        data_url: capture.full_data_url.clone().unwrap_or_default(),
        width: capture.width,
        height: capture.height,
    })
}

// Async so the (potentially heavy) PNG encode runs on a runtime worker thread
// instead of blocking the main UI thread while the editor window opens.
#[tauri::command]
pub async fn take_latest_capture_edit(
    window: tauri::WebviewWindow,
    latest: State<'_, LatestCapture>,
    edit_sessions: State<'_, CaptureEditSessions>,
) -> Result<CaptureEditResult, String> {
    crate::commands::require_window(&window, &["image-editor", "main"])?;

    // Resolve the edit source and (re)use the cached editor data URL, computing
    // it once per capture. The guard is never held across an await.
    let (source, data_url) = {
        let mut guard = latest.0.lock().unwrap();
        let capture = guard
            .as_mut()
            .ok_or_else(|| "No capture available.".to_string())?;
        let source = capture.edit_source.clone().unwrap_or_else(|| EditSource {
            rgba: capture.rgba.clone(),
            width: capture.width,
            height: capture.height,
            crop: EditRect {
                x: 0,
                y: 0,
                width: capture.width,
                height: capture.height,
            },
        });
        if capture.edit_data_url.is_none() {
            capture.edit_data_url = Some(rgba_png_data_url(
                source.width,
                source.height,
                &source.rgba,
            )?);
        }
        (
            source.clone(),
            capture.edit_data_url.clone().unwrap_or_default(),
        )
    };

    let session_id = edit_sessions.store(source.clone());

    Ok(CaptureEditResult {
        session_id,
        data_url,
        width: source.width,
        height: source.height,
        crop: source.crop,
    })
}

#[tauri::command]
pub async fn commit_latest_capture_edit(
    window: tauri::WebviewWindow,
    app: AppHandle,
    edit_sessions: State<'_, CaptureEditSessions>,
    latest: State<'_, LatestCapture>,
    session_id: u64,
    crop: EditRect,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["image-editor", "main"])?;

    if crop.width == 0 || crop.height == 0 {
        return Err("Crop width/height must be > 0.".into());
    }

    let source = edit_sessions
        .source_for(session_id)
        .ok_or_else(|| "Capture edit session expired.".to_string())?;
    let _ = window.hide();

    let sx = crop.x.min(source.width.saturating_sub(1));
    let sy = crop.y.min(source.height.saturating_sub(1));
    let sw = crop
        .x
        .saturating_add(crop.width)
        .min(source.width)
        .saturating_sub(sx)
        .max(1);
    let sh = crop
        .y
        .saturating_add(crop.height)
        .min(source.height)
        .saturating_sub(sy)
        .max(1);
    let img = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(
        source.width,
        source.height,
        source.rgba.clone(),
    )
    .ok_or_else(|| "Editor source pixels are invalid.".to_string())?;
    let cropped = image::imageops::crop_imm(&img, sx, sy, sw, sh).to_image();
    let mut stored = make_stored_capture(&cropped)?;
    stored.edit_source = Some(EditSource {
        rgba: source.rgba,
        width: source.width,
        height: source.height,
        crop: EditRect {
            x: sx,
            y: sy,
            width: sw,
            height: sh,
        },
    });
    *latest.0.lock().unwrap() = Some(stored);
    let _ = app.emit_to("capture-preview", "refresh-capture", ());
    Ok(())
}

#[tauri::command]
pub fn copy_latest_capture_to_clipboard(
    window: tauri::WebviewWindow,
    latest: State<'_, LatestCapture>,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["capture-preview", "main"])?;
    let capture = latest_capture(latest)?;
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set_image(arboard::ImageData {
            width: capture.width as usize,
            height: capture.height as usize,
            bytes: Cow::Owned(capture.rgba),
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_latest_capture_to_desktop(
    window: tauri::WebviewWindow,
    app: AppHandle,
    latest: State<'_, LatestCapture>,
) -> Result<String, String> {
    crate::commands::require_window(&window, &["capture-preview", "main"])?;
    let capture = latest_capture(latest)?;
    let bytes = encode_png_bytes(&capture)?;
    let desktop = app.path().desktop_dir().map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let path = desktop.join(format!("pane-capture-{}.png", now));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Persist an edited capture (resized in the image editor) to the desktop. The
/// editor renders the result client-side and hands back a `data:image/png`
/// (or jpeg) URL; we decode the base64 payload and write the raw bytes as-is.
#[tauri::command]
pub fn save_edited_capture_to_desktop(
    window: tauri::WebviewWindow,
    app: AppHandle,
    data_url: String,
) -> Result<String, String> {
    crate::commands::require_window(&window, &["image-editor", "main"])?;

    let comma = data_url
        .find(',')
        .ok_or_else(|| "Edited image is not a valid data URL.".to_string())?;
    let header = &data_url[..comma];
    if !header.starts_with("data:image/") {
        return Err("Edited image is not an image data URL.".into());
    }
    let bytes = B64
        .decode(&data_url.as_bytes()[comma + 1..])
        .map_err(|e| e.to_string())?;

    let extension = if header.contains("image/jpeg") || header.contains("image/jpg") {
        "jpg"
    } else {
        "png"
    };

    let desktop = app.path().desktop_dir().map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let path = desktop.join(format!("pane-capture-edited-{now}.{extension}"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Replace the latest capture with an edited image from the image editor and
/// ask the floating preview to refresh against the new capture state.
#[tauri::command]
pub fn replace_latest_capture_with_edit(
    window: tauri::WebviewWindow,
    app: AppHandle,
    latest: State<'_, LatestCapture>,
    data_url: String,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["image-editor", "main"])?;

    let comma = data_url
        .find(',')
        .ok_or_else(|| "Edited image is not a valid data URL.".to_string())?;
    let header = &data_url[..comma];
    if !header.starts_with("data:image/") {
        return Err("Edited image is not an image data URL.".into());
    }
    let bytes = B64
        .decode(&data_url.as_bytes()[comma + 1..])
        .map_err(|e| e.to_string())?;
    let mut img = image::load_from_memory(&bytes)
        .map_err(|e| e.to_string())?
        .to_rgba8();
    force_opaque(&mut img);
    let stored = make_stored_capture(&img)?;
    *latest.0.lock().unwrap() = Some(stored);
    let _ = app.emit_to("capture-preview", "refresh-capture", ());
    Ok(())
}
