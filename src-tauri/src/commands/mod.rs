pub mod audio;
pub mod brightness;
pub mod capture;
pub mod capture_sound;
pub mod dx_light;
pub mod dynamic_lighting;
pub mod hotkeys;
pub mod light_state;
pub mod lighting;
pub mod metrics;
pub mod startup;
pub mod windows;

/// Reject IPC calls that don't originate from an allowlisted window.
///
/// App-defined commands are not gated by Tauri's capability system — only
/// core/plugin permissions are — so a compromised child webview could
/// otherwise invoke any registered command. Sensitive commands call this as
/// defense-in-depth to restrict themselves to the window(s) that legitimately
/// use them.
pub fn require_window(window: &tauri::WebviewWindow, allowed: &[&str]) -> Result<(), String> {
    if allowed.contains(&window.label()) {
        Ok(())
    } else {
        Err(format!(
            "Command not permitted from window '{}'.",
            window.label()
        ))
    }
}
