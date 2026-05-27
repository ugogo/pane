use serde::Serialize;
use std::time::Instant;
use sysinfo::{Pid, System};
use tauri::State;

/// Captured at the very top of `run()` in lib.rs — before the Tauri builder
/// starts — so `startup_elapsed_ms` covers Rust init, plugin setup, WebView2
/// spin-up, and the first IPC round-trip.
pub struct StartTime(pub Instant);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMetrics {
    /// OS process ID — cross-reference with Task Manager.
    pid: u32,
    /// Milliseconds since `StartTime` was captured.
    startup_elapsed_ms: u64,
    /// Physical RAM in the working set (bytes).
    working_set_bytes: u64,
    /// Working set in MB (pre-divided for the frontend).
    working_set_mb: f64,
    /// Virtual address space committed (bytes).
    virtual_memory_bytes: u64,
    /// Virtual memory in MB.
    virtual_memory_mb: f64,
}

#[tauri::command]
pub fn get_process_metrics(start_time: State<'_, StartTime>) -> Result<ProcessMetrics, String> {
    let elapsed_ms = start_time.0.elapsed().as_millis() as u64;
    let pid = std::process::id();

    let mut sys = System::new();
    sys.refresh_process(Pid::from_u32(pid));

    let process = sys
        .process(Pid::from_u32(pid))
        .ok_or_else(|| "Process not found in system snapshot.".to_string())?;

    let working_set_bytes = process.memory();
    let virtual_memory_bytes = process.virtual_memory();

    Ok(ProcessMetrics {
        pid,
        startup_elapsed_ms: elapsed_ms,
        working_set_bytes,
        working_set_mb: working_set_bytes as f64 / 1_048_576.0,
        virtual_memory_bytes,
        virtual_memory_mb: virtual_memory_bytes as f64 / 1_048_576.0,
    })
}
