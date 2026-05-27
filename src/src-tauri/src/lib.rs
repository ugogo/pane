mod commands;

use commands::metrics::StartTime;
use std::time::Instant;

pub fn run() {
    // Capture as early as possible so startup_elapsed_ms covers everything:
    // Rust init, Tauri builder, plugin setup, WebView2 spin-up, and the
    // first IPC call from the frontend.
    let boot = Instant::now();

    tauri::Builder::default()
        .manage(StartTime(boot))
        .invoke_handler(tauri::generate_handler![
            commands::metrics::get_process_metrics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Home");
}
