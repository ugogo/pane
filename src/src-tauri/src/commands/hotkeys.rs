use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
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

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct HotkeySettings {
    fullscreen: Option<String>,
    area: Option<String>,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("capture-hotkeys.json"))
}

fn load_settings(app: &AppHandle) -> HotkeySettings {
    let Ok(path) = settings_path(app) else {
        return HotkeySettings::default();
    };
    let Ok(text) = fs::read_to_string(path) else {
        return HotkeySettings::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn save_settings(app: &AppHandle) -> Result<(), String> {
    let b = BINDINGS.lock().unwrap();
    let settings = HotkeySettings {
        fullscreen: b.by_action.get(&CaptureAction::Fullscreen).cloned(),
        area: b.by_action.get(&CaptureAction::Area).cloned(),
    };
    drop(b);

    let path = settings_path(app)?;
    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

fn remember_binding(action: CaptureAction, accelerator: String) {
    let mut b = BINDINGS.lock().unwrap();
    b.by_accel.insert(accelerator.clone(), action);
    b.by_action.insert(action, accelerator);
}

pub fn restore_capture_hotkeys(app: &AppHandle) {
    let settings = load_settings(app);
    let shortcuts = app.global_shortcut();

    for (action, accelerator) in [
        (CaptureAction::Fullscreen, settings.fullscreen),
        (CaptureAction::Area, settings.area),
    ] {
        let Some(accelerator) = accelerator else {
            continue;
        };
        if accelerator.trim().is_empty() {
            continue;
        }
        match shortcuts.register(accelerator.as_str()) {
            Ok(_) => remember_binding(action, accelerator),
            Err(e) => eprintln!("Failed to restore capture hotkey '{}': {}", accelerator, e),
        }
    }
}

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureHotkeys {
    pub fullscreen: String,
    pub area: String,
}

#[tauri::command]
pub fn get_capture_hotkeys() -> CaptureHotkeys {
    let b = BINDINGS.lock().unwrap();
    CaptureHotkeys {
        fullscreen: b
            .by_action
            .get(&CaptureAction::Fullscreen)
            .cloned()
            .unwrap_or_default(),
        area: b
            .by_action
            .get(&CaptureAction::Area)
            .cloned()
            .unwrap_or_default(),
    }
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
        save_settings(&app)?;
        return Ok(HotkeyResult {
            action: action.as_str().into(),
            accelerator: String::new(),
        });
    }

    shortcuts
        .register(accelerator.as_str())
        .map_err(|e| format!("Failed to register '{}': {}", accelerator, e))?;

    remember_binding(action, accelerator.clone());
    save_settings(&app)?;

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
    drop(b);
    save_settings(&app)?;
    Ok(())
}
