//! Persistent per-light state + restore-on-wake.
//!
//! Each apply command records its outcome here so that on:
//!
//! - app restart: the UI seeds its color/brightness from the last value
//!   (no more falling back to white).
//! - system wake from sleep: the OS-level power notification fires
//!   `restore_all()`, which re-applies every persisted state so devices
//!   that power-cycled during sleep (notably the DX Light strip over USB)
//!   come back to the user's last selection instead of the firmware default.
//!
//! Storage: `%LocalAppData%\{identifier}\lights.json` — identifier-scoped like
//! the companion + capture hotkeys, but in `app_local_data_dir` (Local) rather
//! than their `app_config_dir` (Roaming), preserving the original `%LocalAppData%`
//! location. So dev (`dev.pane`) and prod (`prod.pane`) keep separate state. The dir
//! is bound once from Tauri `setup` via [`init_storage`]; before that (or in
//! unit tests) it falls back to the legacy `%LocalAppData%\Pane\lights.json`.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use once_cell::sync::{Lazy, OnceCell};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LightState {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    #[serde(default = "default_brightness")]
    pub brightness: f64,
    /// Tracks the last explicit on/off intent. Apply-color counts as `on`;
    /// only an explicit "Off" button press sets `on=false` (preserving the
    /// last color so the user sees it pre-selected next time).
    #[serde(default = "default_on")]
    pub on: bool,
}

fn default_brightness() -> f64 {
    1.0
}
fn default_on() -> bool {
    true
}

impl Default for LightState {
    fn default() -> Self {
        Self {
            r: 255,
            g: 255,
            b: 255,
            brightness: 1.0,
            on: true,
        }
    }
}

// ── On-disk persistence ──────────────────────────────────────────────────────

static STATE: Lazy<Mutex<HashMap<String, LightState>>> =
    Lazy::new(|| Mutex::new(load_from_disk().unwrap_or_default()));

/// Identifier-scoped storage dir, bound once at startup. `None` until
/// [`init_storage`] runs (tests / pre-setup), where `state_path` falls back to
/// the legacy unscoped location.
static STATE_DIR: OnceCell<PathBuf> = OnceCell::new();

/// Bind light-state storage to the identifier-scoped local data dir
/// (`%LocalAppData%\{identifier}`). Called once from Tauri `setup` before any
/// light command can run, so `dev.pane` and `prod.pane` stay isolated.
pub fn init_storage(app: &AppHandle) {
    match app.path().app_local_data_dir() {
        Ok(dir) => {
            let _ = STATE_DIR.set(dir);
        }
        Err(e) => eprintln!("[light_state] could not resolve local data dir: {e}"),
    }
}

fn state_path() -> Option<PathBuf> {
    if let Some(dir) = STATE_DIR.get() {
        return Some(dir.join("lights.json"));
    }
    // Pre-init or unit tests: legacy unscoped location.
    let local = std::env::var_os("LOCALAPPDATA")?;
    Some(PathBuf::from(local).join("Pane").join("lights.json"))
}

fn load_from_disk() -> Option<HashMap<String, LightState>> {
    let path = state_path()?;
    let data = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

fn save_to_disk(states: &HashMap<String, LightState>) {
    let Some(path) = state_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(states) {
        let _ = fs::write(&path, json);
    }
}

// ── Mutators ────────────────────────────────────────────────────────────────

/// Record the result of an apply for the given light id.
pub fn record(key: impl Into<String>, state: LightState) {
    let key = key.into();
    let mut map = STATE.lock().unwrap();
    map.insert(key, state);
    save_to_disk(&map);
}

/// Mark a light off without forgetting its last color (so the UI can still
/// pre-select that color and a future Apply restores it).
pub fn record_off(key: impl Into<String>) {
    let key = key.into();
    let mut map = STATE.lock().unwrap();
    let entry = map.entry(key).or_default();
    entry.on = false;
    entry.brightness = 0.0;
    save_to_disk(&map);
}

/// Snapshot the current state map.
pub fn snapshot() -> HashMap<String, LightState> {
    STATE.lock().unwrap().clone()
}

// ── Restore ──────────────────────────────────────────────────────────────────

/// Re-apply every persisted state. Used on system wake.
///
/// Each apply is best-effort: a device that's disconnected at restore time
/// just logs an error and we move on. A subsequent manual Apply or another
/// wake cycle will retry.
pub async fn restore_all() -> Vec<(String, Result<(), String>)> {
    use crate::commands::{dx_light, dynamic_lighting, lighting};

    let states = snapshot();
    let mut results = Vec::with_capacity(states.len());

    for (key, st) in states {
        let outcome = if let Some(device_id) = key.strip_prefix("dynamic:") {
            dynamic_lighting::apply_dynamic_lighting_persist(
                device_id.to_string(),
                st.r,
                st.g,
                st.b,
                st.brightness,
            )
            .await
            .map(|_| ())
        } else if key == "msi" {
            lighting::apply_msi_lighting_inner(st.r, st.g, st.b, st.brightness)
        } else if key == "dxlight" {
            if st.on {
                dx_light::apply_dx_light_inner(st.r, st.g, st.b, st.brightness)
            } else {
                dx_light::dx_light_off_inner()
            }
        } else {
            Err(format!("Unknown light kind for key '{key}'"))
        };

        results.push((key, outcome));
    }

    results
}

/// Temporarily turn off all known lights before system sleep without changing
/// persisted user intent. Wake restore uses the saved state to bring them back.
pub async fn turn_all_off_for_sleep() -> Vec<(String, Result<(), String>)> {
    use crate::commands::{dx_light, dynamic_lighting, lighting};

    let mut keys: HashSet<String> = snapshot().keys().cloned().collect();
    let mut results = Vec::new();

    match dynamic_lighting::list_dynamic_lighting_devices().await {
        Ok(devices) => {
            keys.extend(
                devices
                    .into_iter()
                    .map(|device| format!("dynamic:{}", device.id)),
            );
        }
        Err(e) => results.push(("dynamic:scan".to_string(), Err(e))),
    }

    match lighting::detect_msi_lighting() {
        Ok(presence) if presence.present => {
            keys.insert("msi".to_string());
        }
        Ok(_) => {}
        Err(e) => results.push(("msi:scan".to_string(), Err(e))),
    }

    match dx_light::detect_dx_light() {
        Ok(presence) if presence.present => {
            keys.insert("dxlight".to_string());
        }
        Ok(_) => {}
        Err(e) => results.push(("dxlight:scan".to_string(), Err(e))),
    }

    let mut keys: Vec<String> = keys.into_iter().collect();
    keys.sort();

    for key in keys {
        let outcome = if let Some(device_id) = key.strip_prefix("dynamic:") {
            dynamic_lighting::write_dynamic_lighting(device_id.to_string(), 0, 0, 0, 0.0)
                .await
                .map(|_| ())
        } else if key == "msi" {
            lighting::write_msi_lighting(0, 0, 0, 0.0)
        } else if key == "dxlight" {
            dx_light::write_dx_light_off()
        } else {
            Err(format!("Unknown light kind for key '{key}'"))
        };

        results.push((key, outcome));
    }

    results
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_light_states() -> HashMap<String, LightState> {
    snapshot()
}

/// Manual restore — useful for a "Restore" button or for debugging the
/// wake-from-sleep path without actually sleeping the machine.
#[tauri::command]
pub async fn restore_all_lights(
    window: tauri::WebviewWindow,
) -> Result<Vec<(String, Option<String>)>, String> {
    crate::commands::require_window(&window, &["main"])?;
    Ok(restore_all()
        .await
        .into_iter()
        .map(|(k, r)| (k, r.err()))
        .collect())
}

/// Manual probe for the suspend path without putting the machine to sleep.
#[tauri::command]
pub async fn turn_all_lights_off_for_sleep(
    window: tauri::WebviewWindow,
) -> Result<Vec<(String, Option<String>)>, String> {
    crate::commands::require_window(&window, &["main"])?;
    Ok(turn_all_off_for_sleep()
        .await
        .into_iter()
        .map(|(k, r)| (k, r.err()))
        .collect())
}
