use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::commands::{capture, capture_sound, windows};

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

fn canonical_accelerator(accelerator: &str) -> Result<String, String> {
    tauri_plugin_global_shortcut::Shortcut::from_str(accelerator)
        .map(|shortcut| shortcut.to_string())
        .map_err(|e| e.to_string())
}

fn remember_binding(action: CaptureAction, accelerator: String) -> Result<(), String> {
    let canonical = canonical_accelerator(&accelerator)?;
    let mut b = BINDINGS.lock().unwrap();
    b.by_accel.insert(canonical, action);
    b.by_action.insert(action, accelerator);
    Ok(())
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
            Ok(_) => {
                if let Err(e) = remember_binding(action, accelerator.clone()) {
                    eprintln!("Failed to restore capture hotkey '{}': {}", accelerator, e);
                }
            }
            Err(e) => eprintln!("Failed to restore capture hotkey '{}': {}", accelerator, e),
        }
    }
}

/// Plugin handler — invoked on every registered shortcut press. Runs the capture
/// flow entirely in Rust so the main window can stay hidden in the tray.
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
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = dispatch_hotkey_capture(app, action).await {
                eprintln!("Hotkey capture failed: {e}");
            }
        });
    }
}

async fn dispatch_hotkey_capture(app: AppHandle, action: CaptureAction) -> Result<(), String> {
    match action {
        CaptureAction::Fullscreen => {
            capture::perform_fullscreen_capture(&app)?;
            capture_sound::play_capture_sound(&app);
            windows::show_capture_preview(app).await?;
        }
        CaptureAction::Area => {
            windows::show_area_selector(app).await?;
        }
    }
    Ok(())
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
            if let Ok(canonical) = canonical_accelerator(&old) {
                b.by_accel.remove(&canonical);
            }
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

    remember_binding(action, accelerator.clone())?;
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
        if let Ok(canonical) = canonical_accelerator(&old) {
            b.by_accel.remove(&canonical);
        }
    }
    drop(b);
    save_settings(&app)?;
    Ok(())
}
