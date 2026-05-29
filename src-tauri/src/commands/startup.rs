use serde::Serialize;

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_VALUE_NAME: &str = "Pane";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupResult {
    pub enabled: bool,
    pub detail: String,
}

/// Quote the executable path so a path containing spaces is parsed as a single
/// program (and stays correct if launch arguments are ever appended).
fn format_run_value(exe: &std::path::Path) -> String {
    format!("\"{}\"", exe.display())
}

#[tauri::command]
pub fn set_run_at_startup(
    window: tauri::WebviewWindow,
    enabled: bool,
) -> Result<StartupResult, String> {
    crate::commands::require_window(&window, &["main"])?;
    apply(enabled)?;
    Ok(StartupResult {
        enabled,
        detail: if enabled {
            "Startup entry written to HKCU\\…\\Run.".into()
        } else {
            "Startup entry removed from HKCU\\…\\Run.".into()
        },
    })
}

#[tauri::command]
pub fn get_run_at_startup() -> Result<bool, String> {
    is_enabled()
}

#[cfg(windows)]
fn apply(enabled: bool) -> Result<(), String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu.create_subkey(RUN_KEY).map_err(|e| e.to_string())?;

    if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_value(RUN_VALUE_NAME, &format_run_value(&exe))
            .map_err(|e| e.to_string())?;
    } else {
        // Ignore "not found" — deleting a non-existent value is a no-op.
        let _ = key.delete_value(RUN_VALUE_NAME);
    }

    Ok(())
}

#[cfg(windows)]
fn is_enabled() -> Result<bool, String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey(RUN_KEY).map_err(|e| e.to_string())?;
    Ok(key.get_value::<String, _>(RUN_VALUE_NAME).is_ok())
}

#[cfg(not(windows))]
fn apply(_enabled: bool) -> Result<(), String> {
    Err("Startup registry probe is only implemented on Windows.".into())
}

#[cfg(not(windows))]
fn is_enabled() -> Result<bool, String> {
    Err("Startup registry probe is only implemented on Windows.".into())
}

#[cfg(test)]
mod tests {
    use super::format_run_value;
    use std::path::Path;

    #[test]
    fn quotes_path_with_spaces() {
        let value = format_run_value(Path::new(r"C:\Program Files\Pane\pane.exe"));
        assert_eq!(value, r#""C:\Program Files\Pane\pane.exe""#);
    }

    #[test]
    fn quotes_path_without_spaces() {
        let value = format_run_value(Path::new(r"C:\Pane\pane.exe"));
        assert_eq!(value, r#""C:\Pane\pane.exe""#);
    }
}
