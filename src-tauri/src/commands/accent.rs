#[tauri::command]
pub fn accent_select(ch: String) -> Result<(), String> {
    let ch = ch.chars().next().ok_or("empty character")?;
    // Hides the popup, deletes the base letter that was typed on key-down, and
    // injects the chosen accent in its place. The popup never took focus, so the
    // original app is still frontmost and receives the injection.
    crate::accent_popup::commit_char(ch);
    Ok(())
}

#[tauri::command]
pub fn accent_dismiss() -> Result<(), String> {
    crate::accent_popup::dismiss();
    Ok(())
}

#[tauri::command]
pub fn get_accent_popup_enabled() -> bool {
    crate::accent_popup::is_enabled()
}

#[tauri::command]
pub fn set_accent_popup_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    crate::accent_popup::set_enabled(&app, enabled);
    Ok(())
}
