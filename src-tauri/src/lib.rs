mod commands;
mod power_notify;
mod tray;

use commands::capture::LatestCapture;
use commands::metrics::StartTime;
use std::time::Instant;

pub fn run() {
    let boot = Instant::now();

    tauri::Builder::default()
        .manage(StartTime(boot))
        .manage(LatestCapture::default())
        .plugin(tauri_plugin_window_state::Builder::default().build())
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
            commands::hotkeys::restore_capture_hotkeys(app.handle());
            if let Err(e) = power_notify::register() {
                eprintln!("Failed to register power notification: {e}");
            }
            // Push persisted color/brightness back to each device so the
            // hardware matches what the UI displays. Cold-boot launches may
            // race USB enumeration, so give devices a moment to settle —
            // shorter than the wake-from-sleep delay since most launches
            // aren't at boot time.
            tauri::async_runtime::spawn(async {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                let results = commands::light_state::restore_all().await;
                for (key, res) in results {
                    match res {
                        Ok(()) => eprintln!("[startup] restored {key}"),
                        Err(e) => eprintln!("[startup] failed to restore {key}: {e}"),
                    }
                }
            });
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
            commands::capture::copy_latest_capture_to_clipboard,
            commands::capture::save_latest_capture_to_desktop,
            commands::lighting::detect_msi_lighting,
            commands::lighting::apply_msi_lighting,
            commands::dx_light::detect_dx_light,
            commands::dx_light::apply_dx_light,
            commands::dx_light::dx_light_off,
            commands::dynamic_lighting::list_dynamic_lighting_devices,
            commands::dynamic_lighting::get_dynamic_lighting_info,
            commands::dynamic_lighting::diagnose_dynamic_lighting,
            commands::dynamic_lighting::apply_dynamic_lighting,
            commands::light_state::get_light_states,
            commands::light_state::restore_all_lights,
            commands::light_state::turn_all_lights_off_for_sleep,
            commands::windows::prepare_capture_windows,
            commands::windows::show_area_selector,
            commands::windows::show_capture_preview,
            commands::windows::preview_ready,
            commands::windows::hide_capture_preview,
            commands::windows::hide_area_selector,
            commands::windows::area_selector_origin,
            commands::windows::commit_region_capture,
            commands::windows::toggle_capture_preview,
            commands::hotkeys::get_capture_hotkeys,
            commands::hotkeys::set_capture_hotkey,
            commands::hotkeys::clear_capture_hotkey,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Home");
}
