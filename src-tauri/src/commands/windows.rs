use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::commands::capture_sound;

const AREA_SELECTOR_LABEL: &str = "area-selector";
const CAPTURE_PREVIEW_LABEL: &str = "capture-preview";

fn child_url(app: &AppHandle, query: &str) -> Result<WebviewUrl, String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window missing.".to_string())?;
    let mut url = main.url().map_err(|e| e.to_string())?;
    url.set_query(Some(query));
    Ok(WebviewUrl::External(url))
}

fn area_selector_geometry(app: &AppHandle) -> Result<(f64, f64, f64, f64), String> {
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

    let overlay_w = logical_w.max(120.0);
    let overlay_h = logical_h.max(120.0);
    let pos_x = physical_pos.x as f64 / scale;
    let pos_y = physical_pos.y as f64 / scale;

    Ok((overlay_w, overlay_h, pos_x, pos_y))
}

fn preview_geometry(app: &AppHandle) -> Result<(f64, f64, f64, f64), String> {
    let card_w = 200.0;
    let card_h = 200.0;
    let slide_distance = 48.0;
    let win_w = card_w;
    let win_h = card_h + slide_distance;
    let (pos_x, card_y) = bottom_left_position(app, card_w, card_h)?;
    let pos_y = (card_y - slide_distance).max(0.0);

    Ok((win_w, win_h, pos_x, pos_y))
}

fn create_area_selector_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let (overlay_w, overlay_h, pos_x, pos_y) = area_selector_geometry(app)?;
    let url = child_url(app, "view=area-selector")?;
    WebviewWindowBuilder::new(app, AREA_SELECTOR_LABEL, url)
        .title("Select region")
        .inner_size(overlay_w, overlay_h)
        .position(pos_x, pos_y)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())
}

fn create_capture_preview_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let (win_w, win_h, pos_x, pos_y) = preview_geometry(app)?;
    let url = child_url(app, "view=preview")?;
    WebviewWindowBuilder::new(app, CAPTURE_PREVIEW_LABEL, url)
        .title("Capture")
        .inner_size(win_w, win_h)
        .position(pos_x, pos_y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(false)
        .resizable(true)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn prepare_capture_windows(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window(AREA_SELECTOR_LABEL).is_none() {
        create_area_selector_window(&app)?;
    }
    if app.get_webview_window(CAPTURE_PREVIEW_LABEL).is_none() {
        create_capture_preview_window(&app)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn show_area_selector(app: AppHandle) -> Result<(), String> {
    let (overlay_w, overlay_h, pos_x, pos_y) = area_selector_geometry(&app)?;
    let window = match app.get_webview_window(AREA_SELECTOR_LABEL) {
        Some(existing) => existing,
        None => create_area_selector_window(&app)?,
    };

    window
        .set_size(LogicalSize::new(overlay_w, overlay_h))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(pos_x, pos_y))
        .map_err(|e| e.to_string())?;
    app.emit_to(AREA_SELECTOR_LABEL, "reset-area-selector", ())
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
pub async fn show_capture_preview(app: AppHandle) -> Result<(), String> {
    let (win_w, win_h, pos_x, pos_y) = preview_geometry(&app)?;
    let window = match app.get_webview_window(CAPTURE_PREVIEW_LABEL) {
        Some(existing) => existing,
        None => create_capture_preview_window(&app)?,
    };

    window
        .set_size(LogicalSize::new(win_w, win_h))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(pos_x, pos_y))
        .map_err(|e| e.to_string())?;

    app.emit_to(CAPTURE_PREVIEW_LABEL, "refresh-capture", ())
        .map_err(|e| e.to_string())?;
    // Showing a transparent warmed window wakes the frontend even if warmup is
    // still racing the first capture and the event listener misses this emit.
    let _ = window.show();
    Ok(())
}

#[tauri::command]
pub async fn preview_ready(window: WebviewWindow) -> Result<(), String> {
    if window.label() != CAPTURE_PREVIEW_LABEL {
        return Ok(());
    }

    let app = window.app_handle();
    let (win_w, win_h, pos_x, pos_y) = preview_geometry(app)?;

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
    let pos_x = pos_x.min((logical_w - win_w - margin).max(0.0));
    Ok((pos_x, pos_y))
}

#[tauri::command]
pub async fn hide_capture_preview(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(CAPTURE_PREVIEW_LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

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

#[tauri::command]
pub async fn hide_area_selector(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(AREA_SELECTOR_LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn commit_region_capture(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(AREA_SELECTOR_LABEL) {
        let _ = window.hide();
    }
    tokio::time::sleep(std::time::Duration::from_millis(120)).await;

    use crate::commands::capture::{make_stored_capture, LatestCapture};
    use tauri::Manager;

    let result = {
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
        make_stored_capture(&cropped)?
    };

    {
        let latest = app.state::<LatestCapture>();
        *latest.0.lock().unwrap() = Some(result);
    }

    capture_sound::play_capture_sound(&app);
    show_capture_preview(app).await?;
    Ok(())
}

#[tauri::command]
pub fn area_selector_origin(app: AppHandle) -> Result<(i32, i32), String> {
    let window = app
        .get_webview_window(AREA_SELECTOR_LABEL)
        .ok_or_else(|| "Area selector window not open.".to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    Ok((pos.x, pos.y))
}
