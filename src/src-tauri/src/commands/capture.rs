use base64::{engine::general_purpose::STANDARD as B64, Engine};
use image::ImageReader;
use image::{ImageBuffer, ImageFormat, Rgba};
use serde::Serialize;
use std::borrow::Cow;
use std::io::Cursor;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use crate::commands::capture_sound;
use tauri::{AppHandle, Manager, State};
use xcap::Monitor;

/// Holds the most recent capture so the preview window can fetch it after open.
#[derive(Default)]
pub struct LatestCapture(pub Mutex<Option<CaptureResult>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    /// PNG, base64-encoded, ready to drop into an <img src>.
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

fn encode_png(img: &ImageBuffer<Rgba<u8>, Vec<u8>>) -> Result<String, String> {
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", B64.encode(&buf)))
}

fn latest_capture(latest: State<'_, LatestCapture>) -> Result<CaptureResult, String> {
    latest
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "No capture available.".into())
}

fn capture_png_bytes(capture: &CaptureResult) -> Result<Vec<u8>, String> {
    let encoded = capture
        .data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or_else(|| "Latest capture is not a PNG data URL.".to_string())?;
    B64.decode(encoded).map_err(|e| e.to_string())
}

pub fn perform_fullscreen_capture(app: &AppHandle) -> Result<CaptureResult, String> {
    let monitor = primary_monitor()?;
    let img = monitor.capture_image().map_err(|e| e.to_string())?;
    let result = CaptureResult {
        width: img.width(),
        height: img.height(),
        data_url: encode_png(&img)?,
    };
    *app.state::<LatestCapture>().0.lock().unwrap() = Some(result.clone());
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
    let full = monitor.capture_image().map_err(|e| e.to_string())?;

    // Clamp to monitor bounds so we never index out of range.
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
    let result = CaptureResult {
        width: cropped.width(),
        height: cropped.height(),
        data_url: encode_png(&cropped)?,
    };
    *latest.0.lock().unwrap() = Some(result.clone());
    capture_sound::play_capture_sound(&app);
    Ok(result)
}

/// Fetched by the preview window after it opens. Returns and clears the slot.
#[tauri::command]
pub fn take_latest_capture(latest: State<'_, LatestCapture>) -> Option<CaptureResult> {
    latest.0.lock().unwrap().clone()
}

#[tauri::command]
pub fn copy_latest_capture_to_clipboard(latest: State<'_, LatestCapture>) -> Result<(), String> {
    let capture = latest_capture(latest)?;
    let bytes = capture_png_bytes(&capture)?;
    let img = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?
        .to_rgba8();

    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set_image(arboard::ImageData {
            width: img.width() as usize,
            height: img.height() as usize,
            bytes: Cow::Owned(img.into_raw()),
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_latest_capture_to_desktop(
    app: AppHandle,
    latest: State<'_, LatestCapture>,
) -> Result<String, String> {
    let capture = latest_capture(latest)?;
    let bytes = capture_png_bytes(&capture)?;
    let desktop = app.path().desktop_dir().map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let path = desktop.join(format!("home-capture-{}.png", now));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
