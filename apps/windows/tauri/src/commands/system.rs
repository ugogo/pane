#[tauri::command]
pub fn sleep_computer(window: tauri::WebviewWindow) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    request_sleep()
}

#[cfg(windows)]
fn request_sleep() -> Result<(), String> {
    use windows::Win32::System::Power::SetSuspendState;

    let slept = unsafe { SetSuspendState(false, false, false) };
    if slept {
        Ok(())
    } else {
        Err(format!(
            "Windows refused the sleep request: {}",
            std::io::Error::last_os_error()
        ))
    }
}

#[cfg(not(windows))]
fn request_sleep() -> Result<(), String> {
    Err("Sleep is only implemented on Windows.".into())
}
