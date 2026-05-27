use base64::{engine::general_purpose::STANDARD as B64, Engine};
use image::{ImageBuffer, ImageFormat, Rgba};
use serde::Serialize;
use std::io::Cursor;
use std::sync::Mutex;
use tauri::State;
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

#[tauri::command]
pub fn capture_fullscreen(latest: State<'_, LatestCapture>) -> Result<CaptureResult, String> {
    let monitor = primary_monitor()?;
    let img = monitor.capture_image().map_err(|e| e.to_string())?;
    let result = CaptureResult {
        width: img.width(),
        height: img.height(),
        data_url: encode_png(&img)?,
    };
    *latest.0.lock().unwrap() = Some(result.clone());
    Ok(result)
}

#[tauri::command]
pub fn capture_region(
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
    Ok(result)
}

/// Fetched by the preview window after it opens. Returns and clears the slot.
#[tauri::command]
pub fn take_latest_capture(latest: State<'_, LatestCapture>) -> Option<CaptureResult> {
    latest.0.lock().unwrap().clone()
}
