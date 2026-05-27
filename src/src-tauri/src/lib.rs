mod commands;
mod tray;

use commands::capture::LatestCapture;
use commands::metrics::StartTime;
use std::time::Instant;

pub fn run() {
    let boot = Instant::now();

    tauri::Builder::default()
        .manage(StartTime(boot))
        .manage(LatestCapture::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Second launch: focus the existing window instead of opening a new one.
            tray::show_main_window(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(commands::hotkeys::on_shortcut)
                .build(),
        )
        .setup(|app| {
            tray::create(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close button hides the main window to tray rather than exiting.
            // Other windows (area-selector, capture-preview) close normally.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::metrics::get_process_metrics,
            commands::startup::get_run_at_startup,
            commands::startup::set_run_at_startup,
            commands::capture::capture_fullscreen,
            commands::capture::capture_region,
            commands::capture::take_latest_capture,
            commands::windows::show_area_selector,
            commands::windows::show_capture_preview,
            commands::windows::preview_ready,
            commands::windows::close_area_selector,
            commands::windows::area_selector_origin,
            commands::windows::commit_region_capture,
            commands::windows::toggle_capture_preview,
            commands::hotkeys::set_capture_hotkey,
            commands::hotkeys::clear_capture_hotkey,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Home");
}
