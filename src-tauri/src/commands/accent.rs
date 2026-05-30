#[tauri::command]
pub async fn accent_select(ch: String) -> Result<(), String> {
    let ch = ch.chars().next().ok_or("empty character")?;
    // Clears state and hides the popup; focus returns to the previous app.
    crate::accent_popup::select_accent();
    // Wait for the OS to restore focus before injecting.
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    crate::accent_popup::inject_unicode(ch);
    Ok(())
}

#[tauri::command]
pub fn accent_dismiss() -> Result<(), String> {
    crate::accent_popup::dismiss();
    Ok(())
}
