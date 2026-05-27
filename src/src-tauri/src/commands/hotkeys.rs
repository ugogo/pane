use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Two capture actions can be bound to global shortcuts. The map is
/// `accelerator string` → action so the plugin handler can dispatch.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum CaptureAction {
    Fullscreen,
    Area,
}

impl CaptureAction {
    fn as_str(self) -> &'static str {
        match self {
            CaptureAction::Fullscreen => "fullscreen",
            CaptureAction::Area => "area",
        }
    }
}

#[derive(Default)]
struct Bindings {
    /// accelerator → action
    by_accel: HashMap<String, CaptureAction>,
    /// action → accelerator (so re-binding the same action replaces the old one)
    by_action: HashMap<CaptureAction, String>,
}

static BINDINGS: Lazy<Mutex<Bindings>> = Lazy::new(|| Mutex::new(Bindings::default()));

/// Plugin handler — invoked on every registered shortcut press. Looks up the
/// accelerator in BINDINGS and emits `capture-triggered` so the frontend
/// can drive the capture flow.
pub fn on_shortcut(
    app: &AppHandle,
    shortcut: &tauri_plugin_global_shortcut::Shortcut,
    event: tauri_plugin_global_shortcut::ShortcutEvent,
) {
    if event.state() != ShortcutState::Pressed {
        return;
    }
    let accel = shortcut.to_string();
    let action = BINDINGS
        .lock()
        .ok()
        .and_then(|b| b.by_accel.get(&accel).copied());
    if let Some(action) = action {
        let _ = app.emit("capture-triggered", action.as_str());
        // Bring the main window forward so the user sees the preview chain start.
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyResult {
    pub action: String,
    pub accelerator: String,
}

#[tauri::command]
pub fn set_capture_hotkey(
    app: AppHandle,
    action: CaptureAction,
    accelerator: String,
) -> Result<HotkeyResult, String> {
    let shortcuts = app.global_shortcut();

    // Drop any previous binding for this action.
    {
        let mut b = BINDINGS.lock().unwrap();
        if let Some(old) = b.by_action.remove(&action) {
            let _ = shortcuts.unregister(old.as_str());
            b.by_accel.remove(&old);
        }
    }

    // Empty string = clear the binding only.
    if accelerator.trim().is_empty() {
        return Ok(HotkeyResult {
            action: action.as_str().into(),
            accelerator: String::new(),
        });
    }

    shortcuts
        .register(accelerator.as_str())
        .map_err(|e| format!("Failed to register '{}': {}", accelerator, e))?;

    let mut b = BINDINGS.lock().unwrap();
    b.by_accel.insert(accelerator.clone(), action);
    b.by_action.insert(action, accelerator.clone());

    Ok(HotkeyResult {
        action: action.as_str().into(),
        accelerator,
    })
}

#[tauri::command]
pub fn clear_capture_hotkey(app: AppHandle, action: CaptureAction) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    let mut b = BINDINGS.lock().unwrap();
    if let Some(old) = b.by_action.remove(&action) {
        let _ = shortcuts.unregister(old.as_str());
        b.by_accel.remove(&old);
    }
    Ok(())
}
