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

    // Overscan beyond the monitor edges so the dim overlay leaves no uncovered
    // strip from transparent-window edge rounding. The capture maps clicks via
    // the window's real outer_position, so the extra margin stays accurate.
    const OVERSCAN: f64 = 32.0;
    let overlay_w = logical_w.max(120.0) + OVERSCAN * 2.0;
    let overlay_h = logical_h.max(120.0) + OVERSCAN * 2.0;
    let pos_x = physical_pos.x as f64 / scale - OVERSCAN;
    let pos_y = physical_pos.y as f64 / scale - OVERSCAN;

    Ok((overlay_w, overlay_h, pos_x, pos_y))
}

/// Bottom edge of the primary monitor's work area in logical pixels — i.e. the
/// top of the taskbar. Returns `None` if the work area can't be queried.
fn primary_work_area_bottom(scale: f64) -> Option<f64> {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::{
        SystemParametersInfoW, SPI_GETWORKAREA, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
    };

    let mut rect = RECT::default();
    unsafe {
        SystemParametersInfoW(
            SPI_GETWORKAREA,
            0,
            Some(&mut rect as *mut RECT as *mut core::ffi::c_void),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
    }
    .ok()?;
    Some(rect.bottom as f64 / scale)
}

fn preview_geometry(app: &AppHandle) -> Result<(f64, f64, f64, f64), String> {
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

    let card_w = 250.0;
    let card_h = 200.0;
    // Transparent headroom above the card so its drop shadow and the slide/scale
    // animations aren't clipped by the window bounds.
    let headroom: f64 = 32.0;
    let margin_left: f64 = 30.0;
    let gap_above_taskbar: f64 = 30.0;

    let win_w = card_w;
    let win_h = card_h + headroom;

    // The card's bottom sits `gap_above_taskbar` above the taskbar; the card is
    // pinned to the window's bottom edge, so the window bottom lands there too.
    let work_bottom = primary_work_area_bottom(scale).unwrap_or(logical_h);
    let pos_x = margin_left.min((logical_w - win_w - margin_left).max(0.0));
    let pos_y = (work_bottom - gap_above_taskbar - win_h).max(0.0);

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
    let _ = window.set_always_on_top(true);

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
    let _ = window.set_always_on_top(true);
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_focus();
    Ok(())
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
    caller: WebviewWindow,
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    crate::commands::require_window(&caller, &[AREA_SELECTOR_LABEL])?;
    if let Some(window) = app.get_webview_window(AREA_SELECTOR_LABEL) {
        let _ = window.hide();
    }
    tokio::time::sleep(std::time::Duration::from_millis(120)).await;

    use crate::commands::capture::{force_opaque, make_stored_capture, LatestCapture};
    use tauri::Manager;

    let result = {
        use xcap::Monitor;

        let monitor = Monitor::all()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|m| m.is_primary())
            .ok_or_else(|| "No primary monitor.".to_string())?;
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
