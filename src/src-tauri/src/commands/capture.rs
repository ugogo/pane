use crate::commands::capture_sound;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use image::{imageops::FilterType, ImageBuffer, ImageFormat, Rgba};
use serde::Serialize;
use std::borrow::Cow;
use std::io::Cursor;
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use xcap::Monitor;

/// Holds the most recent capture so the preview window can fetch it after open.
#[derive(Default)]
pub struct LatestCapture(pub Mutex<Option<StoredCapture>>);

#[derive(Clone)]
pub struct StoredCapture {
    pub result: CaptureResult,
    pub rgba: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    /// Fast preview data URL, ready to drop into an <img src>.
    pub data_url: String,
    pub width: u32,
    pub height: u32,
}

fn primary_monitor() -> Result<Monitor, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    monitors
        .into_iter()
        .find(|m| m.is_primary())
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
    let started = Instant::now();
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
    eprintln!(
        "capture timing: bmp preview encoded in {}ms",
        started.elapsed().as_millis()
    );
    Ok(data_url)
}

fn preview_image(img: &ImageBuffer<Rgba<u8>, Vec<u8>>) -> ImageBuffer<Rgba<u8>, Vec<u8>> {
    const PREVIEW_MAX_EDGE: u32 = 320;

    let width = img.width();
    let height = img.height();
    let max_edge = width.max(height);
    if max_edge <= PREVIEW_MAX_EDGE {
        return img.clone();
    }

    let scale = PREVIEW_MAX_EDGE as f64 / max_edge as f64;
    let preview_w = ((width as f64 * scale).round() as u32).max(1);
    let preview_h = ((height as f64 * scale).round() as u32).max(1);
    image::imageops::resize(img, preview_w, preview_h, FilterType::Nearest)
}

pub fn make_stored_capture(img: &ImageBuffer<Rgba<u8>, Vec<u8>>) -> Result<StoredCapture, String> {
    let preview_started = Instant::now();
    let preview = preview_image(img);
    eprintln!(
        "capture timing: preview thumbnail prepared in {}ms",
        preview_started.elapsed().as_millis()
    );
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

fn encode_png_bytes(capture: &StoredCapture) -> Result<Vec<u8>, String> {
    let started = Instant::now();
    let img = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(
        capture.width,
        capture.height,
        capture.rgba.clone(),
    )
    .ok_or_else(|| "Latest capture pixels are invalid.".to_string())?;
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    eprintln!(
        "capture timing: deferred png encoded in {}ms",
        started.elapsed().as_millis()
    );
    Ok(buf)
}

pub fn perform_fullscreen_capture(app: &AppHandle) -> Result<CaptureResult, String> {
    let started = Instant::now();
    let monitor = primary_monitor()?;
    let capture_started = Instant::now();
    let img = monitor.capture_image().map_err(|e| e.to_string())?;
    eprintln!(
        "capture timing: fullscreen monitor captured in {}ms",
        capture_started.elapsed().as_millis()
    );
    let stored = make_stored_capture(&img)?;
    let result = stored.result.clone();
    *app.state::<LatestCapture>().0.lock().unwrap() = Some(stored);
    eprintln!(
        "capture timing: fullscreen capture completed in {}ms",
        started.elapsed().as_millis()
    );
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
    let started = Instant::now();
    if width == 0 || height == 0 {
        return Err("Region width/height must be > 0.".into());
    }

    let monitor = primary_monitor()?;
    let capture_started = Instant::now();
    let full = monitor.capture_image().map_err(|e| e.to_string())?;
    eprintln!(
        "capture timing: region monitor captured in {}ms",
        capture_started.elapsed().as_millis()
    );

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
    eprintln!(
        "capture timing: region capture completed in {}ms",
        started.elapsed().as_millis()
    );
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

#[tauri::command]
pub fn copy_latest_capture_to_clipboard(latest: State<'_, LatestCapture>) -> Result<(), String> {
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
    app: AppHandle,
    latest: State<'_, LatestCapture>,
) -> Result<String, String> {
    let capture = latest_capture(latest)?;
    let bytes = encode_png_bytes(&capture)?;
    let desktop = app.path().desktop_dir().map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let path = desktop.join(format!("home-capture-{}.png", now));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
