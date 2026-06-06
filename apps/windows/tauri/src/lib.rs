mod accent_popup;
mod brightness_keys;
mod child_webview_url;
mod commands;
mod power_notify;
mod tray;

use commands::capture::LatestCapture;
use commands::metrics::StartTime;
use std::time::Instant;
use tauri::Manager;

pub(crate) const APP_DISPLAY_NAME: &str = if cfg!(debug_assertions) {
    "Pane (dev)"
} else {
    "Pane"
};

pub fn run() {
    let boot = Instant::now();

    tauri::Builder::default()
        .manage(StartTime(boot))
        .manage(LatestCapture::default())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&[
                    "capture-preview",
                    "capture-zoom",
                    "area-selector",
                    "accent-popup",
                ])
                .build(),
        )
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
            // Bind identifier-scoped storage before anything can read/write light
            // state (the restore spawn below, brightness keys, etc.).
            commands::light_state::init_storage(app.handle());
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(APP_DISPLAY_NAME);
                let _ = window.set_decorations(false);
                let _ = window.set_theme(Some(tauri::Theme::Dark));
            }
            tray::create(app)?;
            commands::hotkeys::restore_capture_hotkeys(app.handle());
            if let Err(e) = power_notify::register() {
                eprintln!("Failed to register power notification: {e}");
            }
            brightness_keys::register(app.handle().clone());
            accent_popup::register(app.handle().clone());
            commands::audio::start_watch(app.handle().clone());
            commands::companion::init(app.handle());
            // Push persisted color/brightness back to each device so the
            // hardware matches what the UI displays. Cold-boot launches may
            // race USB enumeration, so give devices a moment to settle —
            // shorter than the wake-from-sleep delay since most launches
            // aren't at boot time.
            tauri::async_runtime::spawn(async {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                let results = commands::light_state::restore_all().await;
                for (key, res) in results {
                    if let Err(e) = res {
                        eprintln!("[startup] failed to restore {key}: {e}");
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
            commands::system::sleep_computer,
            commands::companion::get_companion_status,
            commands::companion::set_companion_enabled,
            commands::companion::start_companion_pairing,
            commands::companion::cancel_companion_pairing,
            commands::companion::revoke_companion_device,
            commands::capture::capture_fullscreen,
            commands::capture::capture_region,
            commands::capture::take_latest_capture,
            commands::capture::take_latest_capture_full,
            commands::capture::copy_latest_capture_to_clipboard,
            commands::capture::save_latest_capture_to_desktop,
            commands::capture::save_edited_capture_to_desktop,
            commands::capture::replace_latest_capture_with_edit,
            commands::lighting::detect_msi_lighting,
            commands::lighting::apply_msi_lighting,
            commands::dx_light::detect_dx_light,
            commands::dx_light::apply_dx_light,
            commands::dx_light::dx_light_off,
            commands::dynamic_lighting::get_dynamic_lighting_status,
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
            commands::windows::show_capture_zoom,
            commands::windows::hide_capture_zoom,
            commands::windows::toggle_capture_zoom,
            commands::windows::show_image_editor,
            commands::windows::hide_image_editor,
            commands::windows::hide_area_selector,
            commands::windows::area_selector_origin,
            commands::windows::commit_region_capture,
            commands::windows::toggle_capture_preview,
            commands::hotkeys::get_capture_hotkeys,
            commands::hotkeys::set_capture_hotkey,
            commands::hotkeys::clear_capture_hotkey,
            commands::brightness::list_monitors,
            commands::brightness::refresh_monitors,
            commands::brightness::set_monitor_brightness,
            commands::brightness::set_monitor_contrast,
            commands::brightness::set_monitor_red_gain,
            commands::brightness::set_monitor_green_gain,
            commands::brightness::set_monitor_blue_gain,
            commands::brightness::adjust_all_brightness,
            commands::brightness::get_monitor_presets,
            commands::brightness::save_monitor_preset,
            commands::brightness::delete_monitor_preset,
            commands::brightness::apply_monitor_preset,
            commands::audio::list_output_devices,
            commands::audio::list_input_devices,
            commands::audio::set_default_output_device,
            commands::audio::set_default_input_device,
            commands::audio::get_output_volume,
            commands::audio::set_output_volume,
            commands::audio::set_output_mute,
            commands::audio::get_input_volume,
            commands::audio::set_input_volume,
            commands::audio::set_input_mute,
            commands::accent::accent_select,
            commands::accent::accent_dismiss,
            commands::accent::get_accent_popup_enabled,
            commands::accent::set_accent_popup_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pane");
}
