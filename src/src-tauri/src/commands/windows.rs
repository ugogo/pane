use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

#[allow(dead_code)]
const AREA_SELECTOR_HEIGHT_INSET: f64 = 50.0;

use crate::commands::capture_sound;

const AREA_SELECTOR_LABEL: &str = "area-selector";
const CAPTURE_PREVIEW_LABEL: &str = "capture-preview";
/// Shaved from the default 50%-height overlay so the selector feels less tall.

/// Builds a `WebviewUrl::External` from the main window's current URL with
/// the given query string appended. `WebviewUrl::App("…?view=…")` silently
/// drops the query string in Tauri 2, leaving the new window at `about:blank`.
fn child_url(app: &AppHandle, query: &str) -> Result<WebviewUrl, String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window missing.".to_string())?;
    let mut url = main.url().map_err(|e| e.to_string())?;
    url.set_query(Some(query));
    Ok(WebviewUrl::External(url))
}

/// Opens a centered, transparent, always-on-top overlay sized to half the
/// primary monitor width and (half height − 50 logical px). The frontend
/// (view=area-selector) handles rubber-band selection.
#[tauri::command]
pub async fn show_area_selector(app: AppHandle) -> Result<(), String> {
    // If an old one is still around, close it first.
    if let Some(existing) = app.get_webview_window(AREA_SELECTOR_LABEL) {
        let _ = existing.close();
    }

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window missing.".to_string())?;

    let monitor = main
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No primary monitor available.".to_string())?;

    let scale = monitor.scale_factor();
    let physical_pos = monitor.position();
    let physical = monitor.size();
    let logical_w = physical.width as f64 / scale;
    let logical_h = physical.height as f64 / scale;

    // IMPORTANT: On Windows, the primary monitor's virtual-desktop origin is
    // not guaranteed to be (0,0). Use the monitor's position so the overlay
    // covers the full display even in multi-monitor layouts.
    let overlay_w = logical_w.max(120.0);
    let overlay_h = logical_h.max(120.0);
    let pos_x = physical_pos.x as f64 / scale;
    let pos_y = physical_pos.y as f64 / scale;

    let url = child_url(&app, "view=area-selector")?;
    WebviewWindowBuilder::new(&app, AREA_SELECTOR_LABEL, url)
        .title("Select region")
        .inner_size(overlay_w, overlay_h)
        .position(pos_x, pos_y)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Floating, always-on-top window that shows the most recent capture, anchored
/// to the bottom-left of the primary monitor. If the window is already open,
/// it's resized + repositioned for the new image and a `refresh-capture` event
/// is emitted so the frontend re-fetches and re-animates — building a new
/// window when one with the same label already exists fails with
/// "a webview with label … already exists", and `close()` returns immediately
/// while the OS-level destroy is still pending.
#[tauri::command]
pub async fn show_capture_preview(app: AppHandle, _width: u32, _height: u32) -> Result<(), String> {
    // Fixed-size square preview. The image is rendered with `object-contain`
    // on the frontend so it always touches at least two opposite edges of
    // this box regardless of capture aspect.
    let card_w = 200.0;
    let card_h = 200.0;
    let slide_distance = 48.0;
    let win_w = card_w;
    let win_h = card_h + slide_distance;

    // The OS window is a transparent strip. Its bottom extends below the
    // monitor while the visible card's resting top remains at `card_y`.
    let (pos_x, card_y) = bottom_left_position(&app, card_w, card_h)?;
    let pos_y = (card_y - slide_distance).max(0.0);

    if let Some(existing) = app.get_webview_window(CAPTURE_PREVIEW_LABEL) {
        existing
            .set_size(LogicalSize::new(win_w, win_h))
            .map_err(|e| e.to_string())?;
        existing
            .set_position(LogicalPosition::new(pos_x, pos_y))
            .map_err(|e| e.to_string())?;
        let _ = existing.show();
        let _ = existing.set_focus();
        app.emit_to(CAPTURE_PREVIEW_LABEL, "refresh-capture", ())
            .map_err(|e| e.to_string())?;
    } else {
        // First-create path: build hidden and let the frontend call
        // `preview_ready` after it has fetched the capture and produced a
        // painted frame. The slide itself is CSS inside this taller
        // transparent window, which avoids first-show DWM/WebView2 timing.
        let url = child_url(&app, "view=preview")?;
        WebviewWindowBuilder::new(&app, CAPTURE_PREVIEW_LABEL, url)
            .title("Capture")
            .inner_size(win_w, win_h)
            .position(pos_x, pos_y)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(false)
            .resizable(true)
            .visible(false)
            .build()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Called by the capture-preview frontend after it has fetched the capture and
/// yielded a rendered frame. This is deliberately separate from page load so
/// the first visible CSS transition starts after the card can paint.
#[tauri::command]
pub async fn preview_ready(window: WebviewWindow) -> Result<(), String> {
    if window.label() != CAPTURE_PREVIEW_LABEL {
        return Ok(());
    }

    let app = window.app_handle();
    let card_w = 200.0;
    let card_h = 200.0;
    let slide_distance = 48.0;
    let win_w = card_w;
    let win_h = card_h + slide_distance;
    let (pos_x, card_y) = bottom_left_position(app, card_w, card_h)?;
    let pos_y = (card_y - slide_distance).max(0.0);

    window
        .set_size(LogicalSize::new(win_w, win_h))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(pos_x, pos_y))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_focus();

    Ok(())
}

fn bottom_left_position(app: &AppHandle, win_w: f64, win_h: f64) -> Result<(f64, f64), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window missing.".to_string())?;
    let monitor = main
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No primary monitor available.".to_string())?;
    let scale = monitor.scale_factor();
    let phys = monitor.size();
    let logical_w = phys.width as f64 / scale;
    let logical_h = phys.height as f64 / scale;
    let margin = 24.0;
    let pos_x = margin;
    let pos_y = (logical_h - win_h - margin).max(0.0);
    // Guard against a window wider than the screen.
    let pos_x = pos_x.min((logical_w - win_w - margin).max(0.0));
    Ok((pos_x, pos_y))
}

/// Debug helper: toggle the preview window's visibility. Returns the new state.
#[tauri::command]
pub async fn toggle_capture_preview(app: AppHandle) -> Result<bool, String> {
    let Some(window) = app.get_webview_window(CAPTURE_PREVIEW_LABEL) else {
        return Ok(false);
    };
    let visible = window.is_visible().map_err(|e| e.to_string())?;
    if visible {
        window.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        window.show().map_err(|e| e.to_string())?;
        let _ = window.set_focus();
        app.emit_to(CAPTURE_PREVIEW_LABEL, "refresh-capture", ())
            .map_err(|e| e.to_string())?;
        Ok(true)
    }
}

/// Convenience for the area-selector window to dismiss itself after selection.
#[tauri::command]
pub async fn close_area_selector(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(AREA_SELECTOR_LABEL) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Atomically: close the area selector overlay, capture the given region,
/// then open the preview window. Doing this in Rust avoids the JS context
/// in the area-selector webview being destroyed mid-await, which would
/// otherwise cancel the capture + preview chain.
#[tauri::command]
pub async fn commit_region_capture(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    // 1) Hide & close the overlay so it doesn't appear in the screenshot.
    if let Some(window) = app.get_webview_window(AREA_SELECTOR_LABEL) {
        let _ = window.hide();
        let _ = window.close();
    }
    // 2) Brief delay for the OS to actually remove the overlay before snapshot.
    tokio::time::sleep(std::time::Duration::from_millis(120)).await;

    // 3) Capture the region in a scoped block so xcap's non-Send Monitor
    //    is dropped before the next .await.
    use crate::commands::capture::{CaptureResult, LatestCapture};
    use tauri::Manager;

    let result = {
        use base64::{engine::general_purpose::STANDARD as B64, Engine};
        use image::ImageFormat;
        use std::io::Cursor;
        use xcap::Monitor;

        let monitor = Monitor::all()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|m| m.is_primary())
            .ok_or_else(|| "No primary monitor.".to_string())?;
        let full = monitor.capture_image().map_err(|e| e.to_string())?;
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
        let mut buf = Vec::new();
        cropped
            .write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        let data_url = format!("data:image/png;base64,{}", B64.encode(&buf));
        CaptureResult {
            width: cropped.width(),
            height: cropped.height(),
            data_url,
        }
    };

    let (w, h) = (result.width, result.height);
    {
        let latest = app.state::<LatestCapture>();
        *latest.0.lock().unwrap() = Some(result);
    }

    capture_sound::play_capture_sound(&app);

    // 4) Open the preview window with the cropped image.
    show_capture_preview(app, w, h).await
}

/// Reports the area-selector window's screen-space position so the frontend
/// can translate window-local rect coords into absolute monitor coords before
/// calling `capture_region`.
#[tauri::command]
pub fn area_selector_origin(app: AppHandle) -> Result<(i32, i32), String> {
    let window = app
        .get_webview_window(AREA_SELECTOR_LABEL)
        .ok_or_else(|| "Area selector window not open.".to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    Ok((pos.x, pos.y))
}
