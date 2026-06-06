use tauri::{
    webview::Color, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::child_webview_url::{self, routes};
use crate::commands::capture_sound;

const AREA_SELECTOR_LABEL: &str = "area-selector";
const CAPTURE_PREVIEW_LABEL: &str = "capture-preview";
const CAPTURE_ZOOM_LABEL: &str = "capture-zoom";
const IMAGE_EDITOR_LABEL: &str = "image-editor";

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

/// Geometry for the enlarged preview: the capture's aspect ratio fitted inside
/// ~85% of the primary monitor and centered. No headroom — the card fills the
/// whole window in this state (the slide/scale animations don't run when
/// enlarged), so the window is sized exactly to the card.
fn enlarged_geometry(app: &AppHandle) -> Result<(f64, f64, f64, f64), String> {
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

    // Fall back to the screen aspect ratio if no capture is stored yet.
    let aspect = {
        let latest = app.state::<crate::commands::capture::LatestCapture>();
        let guard = latest.0.lock().unwrap();
        match guard.as_ref() {
            Some(c) if c.height > 0 => c.width as f64 / c.height as f64,
            _ => {
                if logical_h > 0.0 {
                    logical_w / logical_h
                } else {
                    1.0
                }
            }
        }
    };

    let max_w = logical_w * 0.85;
    let max_h = logical_h * 0.85;
    let mut win_w = max_w;
    let mut win_h = win_w / aspect;
    if win_h > max_h {
        win_h = max_h;
        win_w = win_h * aspect;
    }

    let pos_x = ((logical_w - win_w) / 2.0).max(0.0);
    let pos_y = ((logical_h - win_h) / 2.0).max(0.0);
    Ok((win_w, win_h, pos_x, pos_y))
}

fn create_area_selector_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let (overlay_w, overlay_h, pos_x, pos_y) = area_selector_geometry(app)?;
    let url = child_webview_url::webview_url(app, routes::AREA_SELECTOR)?;
    let window = WebviewWindowBuilder::new(app, AREA_SELECTOR_LABEL, url)
        .title("Select region")
        .inner_size(overlay_w, overlay_h)
        .position(pos_x, pos_y)
        .decorations(false)
        .transparent(true)
        .background_color(Color(0, 0, 0, 0))
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;

    disable_window_transitions(&window);
    Ok(window)
}

#[cfg(windows)]
fn disable_window_transitions(window: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};
    use windows_core::BOOL;

    let Ok(h) = window.hwnd() else { return };
    let hwnd = HWND(h.0 as *mut _);
    let disabled = BOOL(1);
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            &disabled as *const _ as *const _,
            std::mem::size_of::<BOOL>() as u32,
        );
    }
}

#[cfg(not(windows))]
fn disable_window_transitions(_window: &WebviewWindow) {}

fn create_capture_preview_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let (win_w, win_h, pos_x, pos_y) = preview_geometry(app)?;
    let url = child_webview_url::webview_url(app, routes::CAPTURE_PREVIEW)?;
    let window = WebviewWindowBuilder::new(app, CAPTURE_PREVIEW_LABEL, url)
        .title("Capture")
        .inner_size(win_w, win_h)
        .position(pos_x, pos_y)
        .decorations(false)
        .transparent(true)
        .background_color(Color(0, 0, 0, 0))
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(false)
        .resizable(true)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;

    disable_window_transitions(&window);
    Ok(window)
}

#[tauri::command]
pub async fn prepare_capture_windows(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window(AREA_SELECTOR_LABEL).is_none() {
        create_area_selector_window(&app)?;
    }
    if app.get_webview_window(CAPTURE_PREVIEW_LABEL).is_none() {
        create_capture_preview_window(&app)?;
    }
    // Warm the zoom window too, so the first Space press just shows an already-
    // loaded webview instead of cold-building one.
    if app.get_webview_window(CAPTURE_ZOOM_LABEL).is_none() {
        create_capture_zoom_window(&app)?;
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
    disable_window_transitions(&window);
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
    let was_visible = window.is_visible().unwrap_or(false);

    // A new capture supersedes any open enlarged view of the previous one. Keep
    // the (hidden) window warm and tell it to prefetch the new full-res image so
    // a later Space press shows it instantly.
    if let Some(zoom) = app.get_webview_window(CAPTURE_ZOOM_LABEL) {
        let _ = zoom.hide();
        let _ = app.emit_to(CAPTURE_ZOOM_LABEL, "refresh-capture", ());
    }

    window
        .set_size(LogicalSize::new(win_w, win_h))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(pos_x, pos_y))
        .map_err(|e| e.to_string())?;
    let _ = window.set_always_on_top(true);
    disable_window_transitions(&window);

    app.emit_to(CAPTURE_PREVIEW_LABEL, "refresh-capture", ())
        .map_err(|e| e.to_string())?;
    if was_visible {
        let _ = window.show();
    }
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

fn create_capture_zoom_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let (win_w, win_h, pos_x, pos_y) = enlarged_geometry(app)?;
    let url = child_webview_url::webview_url(app, routes::CAPTURE_ZOOM)?;
    let window = WebviewWindowBuilder::new(app, CAPTURE_ZOOM_LABEL, url)
        .title("Capture preview")
        .inner_size(win_w, win_h)
        .position(pos_x, pos_y)
        .decorations(false)
        .transparent(true)
        .background_color(Color(0, 0, 0, 0))
        .shadow(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;

    disable_window_transitions(&window);
    Ok(window)
}

/// Show the enlarged preview window: a larger, draggable, controls-free copy of
/// the latest capture, centered over the screen. The small card stays put.
#[tauri::command]
pub async fn show_capture_zoom(app: AppHandle) -> Result<(), String> {
    let (win_w, win_h, pos_x, pos_y) = enlarged_geometry(&app)?;
    let window = match app.get_webview_window(CAPTURE_ZOOM_LABEL) {
        Some(existing) => existing,
        None => create_capture_zoom_window(&app)?,
    };
    window
        .set_size(LogicalSize::new(win_w, win_h))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(pos_x, pos_y))
        .map_err(|e| e.to_string())?;
    let _ = window.set_always_on_top(true);
    disable_window_transitions(&window);
    app.emit_to(CAPTURE_ZOOM_LABEL, "refresh-capture", ())
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_focus();
    Ok(())
}

/// Hide the enlarged preview. Sync so it runs on the main thread and dismisses
/// without an async-runtime hop — the close should feel instant. Called directly
/// by the zoom window (Space/Escape/close button).
#[tauri::command]
pub fn hide_capture_zoom(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(CAPTURE_ZOOM_LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    // Hand focus back to the card so the next Space press reopens the zoom.
    if let Some(card) = app.get_webview_window(CAPTURE_PREVIEW_LABEL) {
        let _ = card.set_focus();
    }
    Ok(())
}

/// Toggle the enlarged preview. The card uses this so Space opens (or closes) it.
#[tauri::command]
pub async fn toggle_capture_zoom(app: AppHandle) -> Result<bool, String> {
    let visible = app
        .get_webview_window(CAPTURE_ZOOM_LABEL)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    if visible {
        hide_capture_zoom(app)?;
        Ok(false)
    } else {
        show_capture_zoom(app).await?;
        Ok(true)
    }
}

/// Geometry for the image editor: a generous, centered window sized to ~80% of
/// the primary monitor — large enough to work on the capture, unlike the small
/// preview/zoom cards.
fn image_editor_geometry(app: &AppHandle) -> Result<(f64, f64, f64, f64), String> {
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

    let win_w = (logical_w * 0.8).clamp(640.0, 1280.0).min(logical_w);
    let win_h = (logical_h * 0.8).clamp(480.0, 900.0).min(logical_h);
    let pos_x = ((logical_w - win_w) / 2.0).max(0.0);
    let pos_y = ((logical_h - win_h) / 2.0).max(0.0);
    Ok((win_w, win_h, pos_x, pos_y))
}

fn create_image_editor_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let (win_w, win_h, pos_x, pos_y) = image_editor_geometry(app)?;
    let url = child_webview_url::webview_url(app, routes::IMAGE_EDITOR)?;
    let window = WebviewWindowBuilder::new(app, IMAGE_EDITOR_LABEL, url)
        .title("Edit capture")
        .inner_size(win_w, win_h)
        .min_inner_size(560.0, 420.0)
        .position(pos_x, pos_y)
        .decorations(false)
        .shadow(true)
        .resizable(true)
        .skip_taskbar(false)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;

    disable_window_transitions(&window);
    Ok(window)
}

/// Open the image editor for the latest capture. Reuses the warmed window when
/// present, otherwise builds one, then centers, refreshes, and focuses it.
#[tauri::command]
pub async fn show_image_editor(app: AppHandle) -> Result<(), String> {
    let window = if let Some(existing) = app.get_webview_window(IMAGE_EDITOR_LABEL) {
        existing
    } else {
        create_image_editor_window(&app)?
    };
    disable_window_transitions(&window);
    app.emit_to(IMAGE_EDITOR_LABEL, "refresh-capture", ())
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_focus();
    Ok(())
}

/// Hide the image editor. Sync so the close feels instant (no async-runtime hop).
#[tauri::command]
pub fn hide_image_editor(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(IMAGE_EDITOR_LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
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
            .find(|m| m.is_primary().unwrap_or(false))
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
