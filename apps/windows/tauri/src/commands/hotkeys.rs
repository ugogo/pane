use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::commands::{capture, capture_sound, light_state, system, windows};
use crate::tray;

/// Every Pane action that can be bound to a global shortcut. Rust owns this
/// authoritative dispatch list; the frontend renders richer labels from a
/// shared registry keyed by the same kebab-case ids.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum HotkeyAction {
    CaptureFullscreen,
    CaptureArea,
    ToggleCapturePreview,
    ShowPane,
    SleepComputer,
    RestoreLights,
}

impl HotkeyAction {
    /// Every action the manager exposes, in display order.
    const ALL: [HotkeyAction; 6] = [
        HotkeyAction::CaptureFullscreen,
        HotkeyAction::CaptureArea,
        HotkeyAction::ToggleCapturePreview,
        HotkeyAction::ShowPane,
        HotkeyAction::SleepComputer,
        HotkeyAction::RestoreLights,
    ];

    /// Stable id used in persistence and as the frontend registry key.
    fn as_str(self) -> &'static str {
        match self {
            HotkeyAction::CaptureFullscreen => "capture-fullscreen",
            HotkeyAction::CaptureArea => "capture-area",
            HotkeyAction::ToggleCapturePreview => "toggle-capture-preview",
            HotkeyAction::ShowPane => "show-pane",
            HotkeyAction::SleepComputer => "sleep-computer",
            HotkeyAction::RestoreLights => "restore-lights",
        }
    }

    fn from_id(id: &str) -> Option<HotkeyAction> {
        HotkeyAction::ALL.into_iter().find(|a| a.as_str() == id)
    }
}

#[derive(Default)]
struct Bindings {
    /// accelerator → action
    by_accel: HashMap<String, HotkeyAction>,
    /// action → accelerator (so re-binding the same action replaces the old one)
    by_action: HashMap<HotkeyAction, String>,
}

static BINDINGS: Lazy<Mutex<Bindings>> = Lazy::new(|| Mutex::new(Bindings::default()));

const NEW_FILE: &str = "hotkeys.json";
const LEGACY_FILE: &str = "capture-hotkeys.json";

/// On-disk schema for `hotkeys.json`: action id → accelerator, with room for
/// future per-action metadata behind the version field.
#[derive(Deserialize, Serialize)]
struct HotkeyFile {
    version: u32,
    bindings: HashMap<String, String>,
}

/// Legacy `capture-hotkeys.json` schema, read once to migrate forward.
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyHotkeySettings {
    fullscreen: Option<String>,
    area: Option<String>,
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Decode the persisted `id → accelerator` map, dropping unknown ids and empty
/// accelerators.
fn decode_bindings(raw: HashMap<String, String>) -> HashMap<HotkeyAction, String> {
    raw.into_iter()
        .filter_map(|(id, accel)| {
            let action = HotkeyAction::from_id(&id)?;
            let accel = accel.trim();
            if accel.is_empty() {
                None
            } else {
                Some((action, accel.to_string()))
            }
        })
        .collect()
}

/// Map the legacy capture-only schema onto the generalized action set.
fn migrate_legacy(legacy: &LegacyHotkeySettings) -> HashMap<HotkeyAction, String> {
    let mut out = HashMap::new();
    for (action, accel) in [
        (HotkeyAction::CaptureFullscreen, legacy.fullscreen.as_ref()),
        (HotkeyAction::CaptureArea, legacy.area.as_ref()),
    ] {
        if let Some(accel) = accel {
            let accel = accel.trim();
            if !accel.is_empty() {
                out.insert(action, accel.to_string());
            }
        }
    }
    out
}

/// Load persisted bindings, preferring `hotkeys.json` and falling back to a
/// one-time migration from the legacy `capture-hotkeys.json`.
fn load_bindings(app: &AppHandle) -> HashMap<HotkeyAction, String> {
    let Ok(dir) = config_dir(app) else {
        return HashMap::new();
    };

    if let Ok(text) = fs::read_to_string(dir.join(NEW_FILE)) {
        if let Ok(file) = serde_json::from_str::<HotkeyFile>(&text) {
            return decode_bindings(file.bindings);
        }
    }

    if let Ok(text) = fs::read_to_string(dir.join(LEGACY_FILE)) {
        if let Ok(legacy) = serde_json::from_str::<LegacyHotkeySettings>(&text) {
            return migrate_legacy(&legacy);
        }
    }

    HashMap::new()
}

fn write_settings(app: &AppHandle, bindings: &HashMap<HotkeyAction, String>) -> Result<(), String> {
    let raw = bindings
        .iter()
        .map(|(action, accel)| (action.as_str().to_string(), accel.clone()))
        .collect();
    let file = HotkeyFile {
        version: 1,
        bindings: raw,
    };
    let path = config_dir(app)?.join(NEW_FILE);
    let text = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

/// Persist the current in-memory bindings to `hotkeys.json`.
fn save_settings(app: &AppHandle) -> Result<(), String> {
    let snapshot = BINDINGS.lock().unwrap().by_action.clone();
    write_settings(app, &snapshot)
}

fn canonical_accelerator(accelerator: &str) -> Result<String, String> {
    tauri_plugin_global_shortcut::Shortcut::from_str(accelerator)
        .map(|shortcut| shortcut.to_string())
        .map_err(|e| e.to_string())
}

fn remember_binding(action: HotkeyAction, accelerator: String) -> Result<(), String> {
    let canonical = canonical_accelerator(&accelerator)?;
    let mut b = BINDINGS.lock().unwrap();
    b.by_accel.insert(canonical, action);
    b.by_action.insert(action, accelerator);
    Ok(())
}

/// Returns the action that already owns `canonical`, if it is a *different*
/// action than the one being bound (re-binding the same action is allowed).
fn conflicting_action(
    by_accel: &HashMap<String, HotkeyAction>,
    canonical: &str,
    action: HotkeyAction,
) -> Option<HotkeyAction> {
    match by_accel.get(canonical) {
        Some(&existing) if existing != action => Some(existing),
        _ => None,
    }
}

/// Restore persisted shortcuts at startup, completing any legacy migration by
/// rewriting the canonical `hotkeys.json` once loaded.
pub fn restore_hotkeys(app: &AppHandle) {
    let bindings = load_bindings(app);
    let shortcuts = app.global_shortcut();

    for (action, accelerator) in &bindings {
        match shortcuts.register(accelerator.as_str()) {
            Ok(_) => {
                if let Err(e) = remember_binding(*action, accelerator.clone()) {
                    eprintln!("Failed to restore hotkey '{}': {}", accelerator, e);
                }
            }
            Err(e) => eprintln!("Failed to restore hotkey '{}': {}", accelerator, e),
        }
    }

    // Persist the loaded set so a legacy migration is written to the new file
    // even when an OS registration failed for one of the accelerators.
    if !bindings.is_empty() {
        if let Err(e) = write_settings(app, &bindings) {
            eprintln!("Failed to persist hotkeys.json: {e}");
        }
    }
}

/// Plugin handler — invoked on every registered shortcut press. Runs the action
/// entirely in Rust so the main window can stay hidden in the tray.
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
            if let Err(e) = dispatch_hotkey(app, action).await {
                eprintln!("Hotkey dispatch failed: {e}");
            }
        });
    }
}

async fn dispatch_hotkey(app: AppHandle, action: HotkeyAction) -> Result<(), String> {
    match action {
        HotkeyAction::CaptureFullscreen => {
            capture::perform_fullscreen_capture(&app)?;
            capture_sound::play_capture_sound(&app);
            windows::show_capture_preview(app).await?;
        }
        HotkeyAction::CaptureArea => {
            windows::show_area_selector(app).await?;
        }
        HotkeyAction::ToggleCapturePreview => {
            windows::toggle_capture_preview(app).await?;
        }
        HotkeyAction::ShowPane => {
            tray::show_main_window(&app);
        }
        HotkeyAction::SleepComputer => {
            system::sleep_computer_now()?;
        }
        HotkeyAction::RestoreLights => {
            for (key, res) in light_state::restore_all().await {
                if let Err(e) = res {
                    eprintln!("Hotkey restore-lights failed for {key}: {e}");
                }
            }
        }
    }
    Ok(())
}

/// Core set logic shared by the manager command and the capture compatibility
/// wrapper. An empty accelerator clears the binding. Returns the canonicalized
/// accelerator that was stored (empty string when cleared).
fn apply_set(app: &AppHandle, action: HotkeyAction, accelerator: &str) -> Result<String, String> {
    let trimmed = accelerator.trim();
    if trimmed.is_empty() {
        clear_action(app, action)?;
        return Ok(String::new());
    }

    let shortcuts = app.global_shortcut();
    let canonical = canonical_accelerator(trimmed)?;

    // Reject duplicate bindings inside Pane before touching the OS.
    let conflict = {
        let b = BINDINGS.lock().unwrap();
        conflicting_action(&b.by_accel, &canonical, action)
    };
    if let Some(existing) = conflict {
        return Err(format!("Shortcut already bound to {}", existing.as_str()));
    }

    // Remember the action's current accelerator so we can roll back if the OS
    // refuses the new one.
    let previous = BINDINGS.lock().unwrap().by_action.get(&action).cloned();
    if let Some(old) = previous.as_ref() {
        let _ = shortcuts.unregister(old.as_str());
        let mut b = BINDINGS.lock().unwrap();
        if let Ok(c) = canonical_accelerator(old) {
            b.by_accel.remove(&c);
        }
        b.by_action.remove(&action);
    }

    if let Err(e) = shortcuts.register(trimmed) {
        // Keep the previous binding intact when registration fails.
        if let Some(old) = previous {
            if shortcuts.register(old.as_str()).is_ok() {
                let _ = remember_binding(action, old);
            }
        }
        return Err(format!("Failed to register '{}': {}", trimmed, e));
    }

    remember_binding(action, trimmed.to_string())?;
    save_settings(app)?;
    Ok(trimmed.to_string())
}

fn clear_action(app: &AppHandle, action: HotkeyAction) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    {
        let mut b = BINDINGS.lock().unwrap();
        if let Some(old) = b.by_action.remove(&action) {
            let _ = shortcuts.unregister(old.as_str());
            if let Ok(canonical) = canonical_accelerator(&old) {
                b.by_accel.remove(&canonical);
            }
        }
    }
    save_settings(app)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyResult {
    pub action: String,
    pub accelerator: String,
}

/// One row per manager action: its stable id and the bound accelerator (empty
/// when unbound).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyBindingView {
    pub action: String,
    pub accelerator: String,
}

#[tauri::command]
pub fn list_global_hotkeys() -> Vec<HotkeyBindingView> {
    let b = BINDINGS.lock().unwrap();
    HotkeyAction::ALL
        .into_iter()
        .map(|action| HotkeyBindingView {
            action: action.as_str().into(),
            accelerator: b.by_action.get(&action).cloned().unwrap_or_default(),
        })
        .collect()
}

#[tauri::command]
pub fn set_global_hotkey(
    window: tauri::WebviewWindow,
    app: AppHandle,
    action: HotkeyAction,
    accelerator: String,
) -> Result<HotkeyResult, String> {
    crate::commands::require_window(&window, &["main"])?;
    let accelerator = apply_set(&app, action, &accelerator)?;
    Ok(HotkeyResult {
        action: action.as_str().into(),
        accelerator,
    })
}

#[tauri::command]
pub fn clear_global_hotkey(
    window: tauri::WebviewWindow,
    app: AppHandle,
    action: HotkeyAction,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    clear_action(&app, action)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn action_id_round_trips() {
        for action in HotkeyAction::ALL {
            assert_eq!(HotkeyAction::from_id(action.as_str()), Some(action));
        }
        assert_eq!(HotkeyAction::from_id("nonexistent"), None);
    }

    #[test]
    fn action_serializes_to_kebab_id() {
        let json = serde_json::to_string(&HotkeyAction::ToggleCapturePreview).unwrap();
        assert_eq!(json, "\"toggle-capture-preview\"");
    }

    #[test]
    fn migrates_old_capture_settings() {
        let legacy: LegacyHotkeySettings =
            serde_json::from_str(r#"{"fullscreen":"Ctrl+Shift+1","area":"Ctrl+Shift+2"}"#).unwrap();
        let bindings = migrate_legacy(&legacy);
        assert_eq!(
            bindings
                .get(&HotkeyAction::CaptureFullscreen)
                .map(String::as_str),
            Some("Ctrl+Shift+1")
        );
        assert_eq!(
            bindings.get(&HotkeyAction::CaptureArea).map(String::as_str),
            Some("Ctrl+Shift+2")
        );
        assert_eq!(bindings.len(), 2);
    }

    #[test]
    fn migration_skips_missing_and_blank_bindings() {
        let legacy: LegacyHotkeySettings =
            serde_json::from_str(r#"{"fullscreen":"Ctrl+Shift+1","area":"  "}"#).unwrap();
        let bindings = migrate_legacy(&legacy);
        assert!(bindings.contains_key(&HotkeyAction::CaptureFullscreen));
        assert!(!bindings.contains_key(&HotkeyAction::CaptureArea));
    }

    #[test]
    fn decode_drops_unknown_ids_and_empty_accelerators() {
        let raw = HashMap::from([
            ("capture-fullscreen".to_string(), "Ctrl+Shift+1".to_string()),
            ("capture-area".to_string(), "".to_string()),
            ("ghost-action".to_string(), "Ctrl+Shift+9".to_string()),
        ]);
        let bindings = decode_bindings(raw);
        assert_eq!(bindings.len(), 1);
        assert_eq!(
            bindings
                .get(&HotkeyAction::CaptureFullscreen)
                .map(String::as_str),
            Some("Ctrl+Shift+1")
        );
    }

    #[test]
    fn detects_duplicate_binding_on_other_action() {
        let by_accel =
            HashMap::from([("Ctrl+Shift+1".to_string(), HotkeyAction::CaptureFullscreen)]);
        // Same accelerator, different action → conflict.
        assert_eq!(
            conflicting_action(&by_accel, "Ctrl+Shift+1", HotkeyAction::CaptureArea),
            Some(HotkeyAction::CaptureFullscreen)
        );
        // Same accelerator, same action → re-bind allowed, no conflict.
        assert_eq!(
            conflicting_action(&by_accel, "Ctrl+Shift+1", HotkeyAction::CaptureFullscreen),
            None
        );
        // Free accelerator → no conflict.
        assert_eq!(
            conflicting_action(&by_accel, "Ctrl+Shift+2", HotkeyAction::CaptureArea),
            None
        );
    }
}
