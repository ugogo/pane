//! Persistent presets for lighting devices.
//!
//! Light presets are separate from DDC/CI monitor presets: they target Pane's
//! lighting keys (`msi`, `dxlight`, and `dynamic:{device_id}`) and persist under
//! `app_config_dir`, so dev/prod app identifiers keep independent preset lists.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LightPresetTarget {
    pub key: String,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    #[serde(default = "default_brightness")]
    pub brightness: f64,
    #[serde(default = "default_on")]
    pub on: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LightPreset {
    pub name: String,
    #[serde(default)]
    pub targets: Vec<LightPresetTarget>,
}

fn default_brightness() -> f64 {
    1.0
}

fn default_on() -> bool {
    true
}

fn normalize_brightness(brightness: f64) -> f64 {
    if brightness.is_finite() {
        brightness.clamp(0.0, 1.0)
    } else {
        default_brightness()
    }
}

fn presets_path_for_config_dir(config_dir: &Path) -> PathBuf {
    config_dir.join("light-presets.json")
}

fn presets_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(presets_path_for_config_dir(&dir))
}

fn normalize_preset(preset: LightPreset) -> Result<LightPreset, String> {
    let name = preset.name.trim().to_string();
    if name.is_empty() {
        return Err("preset name cannot be empty".into());
    }

    let mut targets = Vec::with_capacity(preset.targets.len());
    for target in preset.targets {
        let key = target.key.trim().to_string();
        if key.is_empty() {
            return Err("preset target key cannot be empty".into());
        }
        targets.push(LightPresetTarget {
            key,
            r: target.r,
            g: target.g,
            b: target.b,
            brightness: normalize_brightness(target.brightness),
            on: target.on,
        });
    }

    Ok(LightPreset { name, targets })
}

fn load_presets_at(path: &Path) -> Vec<LightPreset> {
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn store_presets_at(path: &Path, presets: &[LightPreset]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(presets).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

fn save_preset_at(path: &Path, preset: LightPreset) -> Result<Vec<LightPreset>, String> {
    let preset = normalize_preset(preset)?;
    let mut presets = load_presets_at(path);

    match presets
        .iter_mut()
        .find(|existing| existing.name.eq_ignore_ascii_case(&preset.name))
    {
        Some(existing) => *existing = preset,
        None => presets.push(preset),
    }

    store_presets_at(path, &presets)?;
    Ok(presets)
}

fn delete_preset_at(path: &Path, name: &str) -> Result<Vec<LightPreset>, String> {
    let mut presets = load_presets_at(path);
    presets.retain(|preset| !preset.name.eq_ignore_ascii_case(name));
    store_presets_at(path, &presets)?;
    Ok(presets)
}

#[derive(Clone, Debug, PartialEq)]
enum TargetMatch {
    Dynamic(String),
    Msi,
    DxLight,
    Unknown,
}

fn match_target(key: &str) -> TargetMatch {
    if let Some(device_id) = key.strip_prefix("dynamic:") {
        return TargetMatch::Dynamic(device_id.to_string());
    }
    if key == "msi" {
        return TargetMatch::Msi;
    }
    if key == "dxlight" {
        return TargetMatch::DxLight;
    }
    TargetMatch::Unknown
}

async fn connected_dynamic_ids() -> Result<HashSet<String>, String> {
    crate::commands::dynamic_lighting::list_dynamic_lighting_devices()
        .await
        .map(|devices| devices.into_iter().map(|device| device.id).collect())
}

async fn apply_target(target: LightPresetTarget) -> Result<(), String> {
    match match_target(&target.key) {
        TargetMatch::Dynamic(device_id) => {
            let connected = connected_dynamic_ids().await?;
            if !connected.contains(&device_id) {
                return Err("not connected".into());
            }
            let brightness = if target.on { target.brightness } else { 0.0 };
            crate::commands::dynamic_lighting::apply_dynamic_lighting_persist(
                device_id, target.r, target.g, target.b, brightness,
            )
            .await
            .map(|_| ())
        }
        TargetMatch::Msi => {
            let presence = crate::commands::lighting::detect_msi_lighting()?;
            if !presence.present {
                return Err("not connected".into());
            }
            let brightness = if target.on { target.brightness } else { 0.0 };
            crate::commands::lighting::apply_msi_lighting_inner(
                target.r, target.g, target.b, brightness,
            )
        }
        TargetMatch::DxLight => {
            let presence = crate::commands::dx_light::detect_dx_light()?;
            if !presence.present {
                return Err("not connected".into());
            }
            if target.on {
                crate::commands::dx_light::apply_dx_light_inner(
                    target.r,
                    target.g,
                    target.b,
                    target.brightness,
                )
            } else {
                crate::commands::dx_light::dx_light_off_inner()
            }
        }
        TargetMatch::Unknown => Err(format!("unknown light key '{}'", target.key)),
    }
}

#[tauri::command]
pub fn get_light_presets(
    window: tauri::WebviewWindow,
    app: AppHandle,
) -> Result<Vec<LightPreset>, String> {
    crate::commands::require_window(&window, &["main"])?;
    let path = presets_path(&app)?;
    Ok(load_presets_at(&path))
}

#[tauri::command]
pub fn save_light_preset(
    window: tauri::WebviewWindow,
    app: AppHandle,
    preset: LightPreset,
) -> Result<Vec<LightPreset>, String> {
    crate::commands::require_window(&window, &["main"])?;
    let path = presets_path(&app)?;
    save_preset_at(&path, preset)
}

#[tauri::command]
pub fn delete_light_preset(
    window: tauri::WebviewWindow,
    app: AppHandle,
    name: String,
) -> Result<Vec<LightPreset>, String> {
    crate::commands::require_window(&window, &["main"])?;
    let path = presets_path(&app)?;
    delete_preset_at(&path, &name)
}

#[tauri::command]
pub async fn apply_light_preset(
    window: tauri::WebviewWindow,
    app: AppHandle,
    name: String,
) -> Result<Vec<(String, Option<String>)>, String> {
    crate::commands::require_window(&window, &["main"])?;
    let path = presets_path(&app)?;
    let preset = load_presets_at(&path)
        .into_iter()
        .find(|preset| preset.name.eq_ignore_ascii_case(&name))
        .ok_or_else(|| format!("preset '{name}' not found"))?;

    let mut results = Vec::with_capacity(preset.targets.len());
    for target in preset.targets {
        let key = target.key.clone();
        let error = apply_target(target).await.err();
        results.push((key, error));
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir()
            .join("pane-light-presets-tests")
            .join(format!("{name}-{nonce}"))
            .join("light-presets.json")
    }

    fn preset(name: &str, key: &str, brightness: f64) -> LightPreset {
        LightPreset {
            name: name.to_string(),
            targets: vec![LightPresetTarget {
                key: key.to_string(),
                r: 255,
                g: 170,
                b: 96,
                brightness,
                on: true,
            }],
        }
    }

    #[test]
    fn round_trips_json_presets() {
        let path = temp_path("round-trip");
        let saved = save_preset_at(&path, preset("Night", "dxlight", 0.28)).unwrap();
        let loaded = load_presets_at(&path);

        assert_eq!(saved, loaded);
        assert_eq!(loaded[0].targets[0].key, "dxlight");
        assert_eq!(loaded[0].targets[0].brightness, 0.28);
    }

    #[test]
    fn overwrites_presets_by_case_insensitive_name() {
        let path = temp_path("overwrite");
        save_preset_at(&path, preset("Night", "dxlight", 0.28)).unwrap();
        let saved = save_preset_at(&path, preset("night", "msi", 2.0)).unwrap();

        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].name, "night");
        assert_eq!(saved[0].targets[0].key, "msi");
        assert_eq!(saved[0].targets[0].brightness, 1.0);
    }

    #[test]
    fn deletes_presets_by_case_insensitive_name() {
        let path = temp_path("delete");
        save_preset_at(&path, preset("Night", "dxlight", 0.28)).unwrap();
        save_preset_at(&path, preset("Day", "msi", 1.0)).unwrap();

        let saved = delete_preset_at(&path, "night").unwrap();

        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].name, "Day");
    }

    #[test]
    fn constructs_identifier_scoped_config_path() {
        let config_dir = PathBuf::from(r"C:\Users\Home\AppData\Roaming\com.ugogo.pane.dev");
        let path = presets_path_for_config_dir(&config_dir);

        assert_eq!(path, config_dir.join("light-presets.json"));
    }

    #[test]
    fn rejects_empty_names_and_target_keys() {
        let path = temp_path("reject-empty");

        assert!(save_preset_at(&path, preset(" ", "dxlight", 0.5)).is_err());
        assert!(save_preset_at(&path, preset("Night", " ", 0.5)).is_err());
    }

    #[test]
    fn matches_target_keys() {
        assert_eq!(
            match_target("dynamic:keyboard-1"),
            TargetMatch::Dynamic("keyboard-1".to_string())
        );
        assert_eq!(match_target("msi"), TargetMatch::Msi);
        assert_eq!(match_target("dxlight"), TargetMatch::DxLight);
        assert_eq!(match_target("unknown"), TargetMatch::Unknown);
    }
}
