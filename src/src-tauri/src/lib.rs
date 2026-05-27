mod commands;
mod tray;

use commands::metrics::StartTime;
use std::time::Instant;

pub fn run() {
    let boot = Instant::now();

    tauri::Builder::default()
        .manage(StartTime(boot))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Second launch: focus the existing window instead of opening a new one.
            tray::show_main_window(app);
        }))
        .setup(|app| {
            tray::create(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close button hides to tray rather than exiting.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::metrics::get_process_metrics,
            commands::startup::get_run_at_startup,
            commands::startup::set_run_at_startup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Home");
}
