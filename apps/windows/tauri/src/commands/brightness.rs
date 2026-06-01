//! DDC/CI monitor controls (brightness, contrast) + day/night presets.
//!
//! External desktop monitors expose adjustable settings over DDC/CI as VCP
//! feature codes — brightness is `0x10`, contrast is `0x12`. Windows has no
//! built-in path to drive these for an external monitor, so we talk to the
//! monitor directly via the Win32 Monitor Configuration API, wrapped by
//! `ddc-winapi`.
//!
//! `ddc_winapi::Monitor` wraps a raw OS handle and is not `Send`, so we can't
//! cache live handles in a `static`. Instead we cache only lightweight, `Send`
//! metadata (name + current/max/capability per feature) keyed by enumeration
//! index, and re-enumerate fresh handles for each read/write. Enumeration is
//! cheap relative to the DDC I2C round-trip, which dominates the cost — so
//! caching the value (not the handle) is what lets the physical brightness key
//! step without a slow read on every press.
//!
//! Presets store target brightness/contrast as *percentages* (not raw VCP
//! values) so one preset applies sensibly across monitors with different
//! ranges. They persist to `monitor-presets.json` in the app config dir.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[cfg(windows)]
use ddc::Ddc;
#[cfg(windows)]
use once_cell::sync::Lazy;
#[cfg(windows)]
use std::sync::Mutex;

#[cfg(windows)]
const VCP_BRIGHTNESS: u8 = 0x10;
#[cfg(windows)]
const VCP_CONTRAST: u8 = 0x12;
// White-balance video gains. Adjusting these relative to each other shifts the
// white point (colour temperature). Most monitors that lack a true saturation
// VCP code still expose these.
#[cfg(windows)]
const VCP_RED_GAIN: u8 = 0x16;
#[cfg(windows)]
const VCP_GREEN_GAIN: u8 = 0x18;
#[cfg(windows)]
const VCP_BLUE_GAIN: u8 = 0x1A;

/// One adjustable DDC/CI control on a monitor.
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Feature {
    pub value: u16,
    pub max: u16,
    /// False when the monitor doesn't expose this VCP code.
    pub supported: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    /// Enumeration index as a string — stable within a session.
    pub id: String,
    pub name: String,
    pub brightness: Feature,
    pub contrast: Feature,
    pub red_gain: Feature,
    pub green_gain: Feature,
    pub blue_gain: Feature,
}

/// A reusable target, stored as percentages so it applies across monitors with
/// different VCP ranges.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub name: String,
    pub brightness_pct: u8,
    pub contrast_pct: u8,
    #[serde(default = "default_pct")]
    pub red_gain_pct: u8,
    #[serde(default = "default_pct")]
    pub green_gain_pct: u8,
    #[serde(default = "default_pct")]
    pub blue_gain_pct: u8,
}

fn default_pct() -> u8 {
    100
}

// ── DDC/CI (Windows only) ───────────────────────────────────────────────────

#[cfg(windows)]
#[derive(Clone)]
struct Cached {
    name: String,
    brightness: Feature,
    contrast: Feature,
    red_gain: Feature,
    green_gain: Feature,
    blue_gain: Feature,
}

#[cfg(windows)]
static CACHE: Lazy<Mutex<Vec<Cached>>> = Lazy::new(|| Mutex::new(Vec::new()));

#[cfg(windows)]
#[derive(Clone, Copy)]
enum Which {
    Brightness,
    Contrast,
    RedGain,
    GreenGain,
    BlueGain,
}

#[cfg(windows)]
impl Which {
    /// VCP code written for this control.
    fn code(self) -> u8 {
        match self {
            Which::Brightness => VCP_BRIGHTNESS,
            Which::Contrast => VCP_CONTRAST,
            Which::RedGain => VCP_RED_GAIN,
            Which::GreenGain => VCP_GREEN_GAIN,
            Which::BlueGain => VCP_BLUE_GAIN,
        }
    }
}

#[cfg(windows)]
fn feature_of(c: &Cached, which: Which) -> &Feature {
    match which {
        Which::Brightness => &c.brightness,
        Which::Contrast => &c.contrast,
        Which::RedGain => &c.red_gain,
        Which::GreenGain => &c.green_gain,
        Which::BlueGain => &c.blue_gain,
    }
}

#[cfg(windows)]
fn feature_mut(c: &mut Cached, which: Which) -> &mut Feature {
    match which {
        Which::Brightness => &mut c.brightness,
        Which::Contrast => &mut c.contrast,
        Which::RedGain => &mut c.red_gain,
        Which::GreenGain => &mut c.green_gain,
        Which::BlueGain => &mut c.blue_gain,
    }
}

#[cfg(windows)]
fn enumerate() -> Vec<ddc_winapi::Monitor> {
    ddc_winapi::Monitor::enumerate().unwrap_or_default()
}

#[cfg(windows)]
fn read_feature(mon: &mut ddc_winapi::Monitor, code: u8) -> Feature {
    match mon.get_vcp_feature(code) {
        Ok(v) => Feature {
            value: v.value(),
            max: v.maximum(),
            supported: true,
        },
        Err(_) => Feature {
            value: 0,
            max: 100,
            supported: false,
        },
    }
}

#[cfg(windows)]
fn cached_to_info(index: usize, c: &Cached) -> MonitorInfo {
    MonitorInfo {
        id: index.to_string(),
        name: c.name.clone(),
        brightness: c.brightness.clone(),
        contrast: c.contrast.clone(),
        red_gain: c.red_gain.clone(),
        green_gain: c.green_gain.clone(),
        blue_gain: c.blue_gain.clone(),
    }
}

/// Enumerate monitors, read each control once, and reseed the cache.
#[cfg(windows)]
fn read_seed() -> Vec<MonitorInfo> {
    let monitors = enumerate();
    let mut cache = CACHE.lock().unwrap();
    cache.clear();
    let mut out = Vec::with_capacity(monitors.len());
    for (index, mut mon) in monitors.into_iter().enumerate() {
        let name = mon.description();
        let brightness = read_feature(&mut mon, VCP_BRIGHTNESS);
        let contrast = read_feature(&mut mon, VCP_CONTRAST);
        let red_gain = read_feature(&mut mon, VCP_RED_GAIN);
        let green_gain = read_feature(&mut mon, VCP_GREEN_GAIN);
        let blue_gain = read_feature(&mut mon, VCP_BLUE_GAIN);
        let entry = Cached {
            name,
            brightness,
            contrast,
            red_gain,
            green_gain,
            blue_gain,
        };
        out.push(cached_to_info(index, &entry));
        cache.push(entry);
    }
    out
}

#[cfg(windows)]
fn set_feature(id: &str, which: Which, value: u16) -> Result<(), String> {
    let index: usize = id
        .parse()
        .map_err(|_| format!("invalid monitor id '{id}'"))?;
    let mut cache = CACHE.lock().unwrap();
    let entry = cache
        .get_mut(index)
        .ok_or_else(|| format!("monitor {id} not found"))?;
    let max = {
        let f = feature_of(entry, which);
        if !f.supported {
            return Err(format!("monitor {id} does not support this control"));
        }
        f.max
    };
    let clamped = value.min(max);
    let mut monitors = enumerate();
    let mon = monitors
        .get_mut(index)
        .ok_or_else(|| format!("monitor {id} is no longer present"))?;
    mon.set_vcp_feature(which.code(), clamped)
        .map_err(|e| e.to_string())?;
    feature_mut(entry, which).value = clamped;
    Ok(())
}

/// Step every brightness-capable monitor by `delta`. Brightness only — the
/// physical brightness key drives this. Shared with `brightness_keys`.
#[cfg(windows)]
pub fn adjust_all(delta: i32) -> Vec<MonitorInfo> {
    let mut cache = CACHE.lock().unwrap();
    if cache.is_empty() {
        drop(cache);
        read_seed();
        cache = CACHE.lock().unwrap();
    }

    let mut monitors = enumerate();
    let mut out = Vec::with_capacity(cache.len());
    for (index, entry) in cache.iter_mut().enumerate() {
        if entry.brightness.supported {
            let target = (entry.brightness.value as i32 + delta)
                .clamp(0, entry.brightness.max as i32) as u16;
            if let Some(mon) = monitors.get_mut(index) {
                if mon.set_vcp_feature(VCP_BRIGHTNESS, target).is_ok() {
                    entry.brightness.value = target;
                }
            }
        }
        out.push(cached_to_info(index, entry));
    }
    out
}

/// Set every brightness-capable monitor to an absolute `pct` (0–100). Window-
/// free so both the Tauri command path and the companion HTTP handler share one
/// implementation. Returns the refreshed monitor list.
#[cfg(windows)]
pub fn set_all_brightness_pct(pct: u8) -> Vec<MonitorInfo> {
    let mut cache = CACHE.lock().unwrap();
    if cache.is_empty() {
        drop(cache);
        read_seed();
        cache = CACHE.lock().unwrap();
    }

    let mut monitors = enumerate();
    let mut out = Vec::with_capacity(cache.len());
    for (index, entry) in cache.iter_mut().enumerate() {
        if entry.brightness.supported {
            let target = pct_to_value(pct, entry.brightness.max);
            if let Some(mon) = monitors.get_mut(index) {
                if mon.set_vcp_feature(VCP_BRIGHTNESS, target).is_ok() {
                    entry.brightness.value = target;
                }
            }
        }
        out.push(cached_to_info(index, entry));
    }
    out
}

#[cfg(not(windows))]
pub fn set_all_brightness_pct(_pct: u8) -> Vec<MonitorInfo> {
    Vec::new()
}

#[cfg(windows)]
fn pct_to_value(pct: u8, max: u16) -> u16 {
    let pct = pct.min(100) as u32;
    (((pct * max as u32) + 50) / 100) as u16
}

/// Drive every capable monitor to the given brightness/contrast/white-balance
/// percentages.
#[cfg(windows)]
fn apply_pcts(
    brightness_pct: u8,
    contrast_pct: u8,
    red_gain_pct: u8,
    green_gain_pct: u8,
    blue_gain_pct: u8,
) -> Vec<MonitorInfo> {
    let mut cache = CACHE.lock().unwrap();
    if cache.is_empty() {
        drop(cache);
        read_seed();
        cache = CACHE.lock().unwrap();
    }

    let mut monitors = enumerate();
    let mut out = Vec::with_capacity(cache.len());
    for (index, entry) in cache.iter_mut().enumerate() {
        if let Some(mon) = monitors.get_mut(index) {
            for (which, pct) in [
                (Which::Brightness, brightness_pct),
                (Which::Contrast, contrast_pct),
                (Which::RedGain, red_gain_pct),
                (Which::GreenGain, green_gain_pct),
                (Which::BlueGain, blue_gain_pct),
            ] {
                let (supported, max) = {
                    let f = feature_of(entry, which);
                    (f.supported, f.max)
                };
                if supported {
                    let target = pct_to_value(pct, max).min(max);
                    if mon.set_vcp_feature(which.code(), target).is_ok() {
                        feature_mut(entry, which).value = target;
                    }
                }
            }
        }
        out.push(cached_to_info(index, entry));
    }
    out
}

// ── Preset persistence (all platforms) ──────────────────────────────────────

fn presets_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("monitor-presets.json"))
}

fn default_presets() -> Vec<Preset> {
    vec![
        Preset {
            name: "Day".into(),
            brightness_pct: 100,
            contrast_pct: 80,
            red_gain_pct: 100,
            green_gain_pct: 100,
            blue_gain_pct: 100,
        },
        // Dim, low-contrast and warm (red full, green eased, blue pulled down) —
        // an amber white point that replaces the old Windows Night Light toggle.
        Preset {
            name: "Night".into(),
            brightness_pct: 30,
            contrast_pct: 50,
            red_gain_pct: 100,
            green_gain_pct: 72,
            blue_gain_pct: 32,
        },
    ]
}

fn load_presets(app: &AppHandle) -> Vec<Preset> {
    match presets_path(app) {
        Ok(path) => load_presets_at(&path),
        Err(_) => default_presets(),
    }
}

/// Load monitor presets from the app config directory (companion-safe, no
/// `AppHandle`).
pub fn load_presets_at(path: &Path) -> Vec<Preset> {
    let Ok(text) = fs::read_to_string(path) else {
        return default_presets();
    };
    serde_json::from_str(&text).unwrap_or_else(|_| default_presets())
}

/// Mean brightness across capable monitors, as 0–100. Returns 50 when none
/// report brightness.
pub fn average_brightness_pct(monitors: &[MonitorInfo]) -> u8 {
    let mut count = 0u32;
    let mut sum = 0u32;
    for monitor in monitors {
        if monitor.brightness.supported && monitor.brightness.max > 0 {
            count += 1;
            let pct = (monitor.brightness.value as u32 * 100 + monitor.brightness.max as u32 / 2)
                / monitor.brightness.max as u32;
            sum += pct.min(100);
        }
    }
    if count == 0 {
        50
    } else {
        sum.checked_div(count).unwrap_or(50).min(100) as u8
    }
}

#[cfg(windows)]
pub fn list_monitors_snapshot() -> Vec<MonitorInfo> {
    read_seed()
}

#[cfg(not(windows))]
pub fn list_monitors_snapshot() -> Vec<MonitorInfo> {
    Vec::new()
}

#[cfg(windows)]
pub fn apply_preset_at(path: &Path, name: &str) -> Result<Vec<MonitorInfo>, String> {
    let presets = load_presets_at(path);
    let preset = presets
        .into_iter()
        .find(|p| p.name.eq_ignore_ascii_case(name))
        .ok_or_else(|| format!("preset '{name}' not found"))?;
    Ok(apply_pcts(
        preset.brightness_pct,
        preset.contrast_pct,
        preset.red_gain_pct,
        preset.green_gain_pct,
        preset.blue_gain_pct,
    ))
}

#[cfg(not(windows))]
pub fn apply_preset_at(_path: &Path, name: &str) -> Result<Vec<MonitorInfo>, String> {
    Err(format!(
        "preset '{name}' cannot be applied: brightness control is only implemented on Windows"
    ))
}

fn store_presets(app: &AppHandle, presets: &[Preset]) -> Result<(), String> {
    let path = presets_path(app)?;
    let text = serde_json::to_string_pretty(presets).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_monitors(window: tauri::WebviewWindow) -> Result<Vec<MonitorInfo>, String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        Ok(read_seed())
    }
    #[cfg(not(windows))]
    {
        Err("brightness control is only implemented on Windows".into())
    }
}

#[tauri::command]
pub fn refresh_monitors(window: tauri::WebviewWindow) -> Result<Vec<MonitorInfo>, String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        Ok(read_seed())
    }
    #[cfg(not(windows))]
    {
        Err("brightness control is only implemented on Windows".into())
    }
}

#[tauri::command]
pub fn set_monitor_brightness(
    window: tauri::WebviewWindow,
    id: String,
    value: u16,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        set_feature(&id, Which::Brightness, value)
    }
    #[cfg(not(windows))]
    {
        let _ = (id, value);
        Err("brightness control is only implemented on Windows".into())
    }
}

#[tauri::command]
pub fn set_monitor_contrast(
    window: tauri::WebviewWindow,
    id: String,
    value: u16,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        set_feature(&id, Which::Contrast, value)
    }
    #[cfg(not(windows))]
    {
        let _ = (id, value);
        Err("brightness control is only implemented on Windows".into())
    }
}

#[tauri::command]
pub fn set_monitor_red_gain(
    window: tauri::WebviewWindow,
    id: String,
    value: u16,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        set_feature(&id, Which::RedGain, value)
    }
    #[cfg(not(windows))]
    {
        let _ = (id, value);
        Err("brightness control is only implemented on Windows".into())
    }
}

#[tauri::command]
pub fn set_monitor_green_gain(
    window: tauri::WebviewWindow,
    id: String,
    value: u16,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        set_feature(&id, Which::GreenGain, value)
    }
    #[cfg(not(windows))]
    {
        let _ = (id, value);
        Err("brightness control is only implemented on Windows".into())
    }
}

#[tauri::command]
pub fn set_monitor_blue_gain(
    window: tauri::WebviewWindow,
    id: String,
    value: u16,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        set_feature(&id, Which::BlueGain, value)
    }
    #[cfg(not(windows))]
    {
        let _ = (id, value);
        Err("brightness control is only implemented on Windows".into())
    }
}

#[tauri::command]
pub fn adjust_all_brightness(
    window: tauri::WebviewWindow,
    delta: i32,
) -> Result<Vec<MonitorInfo>, String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        Ok(adjust_all(delta))
    }
    #[cfg(not(windows))]
    {
        let _ = delta;
        Err("brightness control is only implemented on Windows".into())
    }
}

#[tauri::command]
pub fn get_monitor_presets(
    window: tauri::WebviewWindow,
    app: AppHandle,
) -> Result<Vec<Preset>, String> {
    crate::commands::require_window(&window, &["main"])?;
    Ok(load_presets(&app))
}

#[tauri::command]
pub fn save_monitor_preset(
    window: tauri::WebviewWindow,
    app: AppHandle,
    preset: Preset,
) -> Result<Vec<Preset>, String> {
    crate::commands::require_window(&window, &["main"])?;
    let name = preset.name.trim().to_string();
    if name.is_empty() {
        return Err("preset name cannot be empty".into());
    }
    let mut presets = load_presets(&app);
    let preset = Preset {
        name: name.clone(),
        brightness_pct: preset.brightness_pct.min(100),
        contrast_pct: preset.contrast_pct.min(100),
        red_gain_pct: preset.red_gain_pct.min(100),
        green_gain_pct: preset.green_gain_pct.min(100),
        blue_gain_pct: preset.blue_gain_pct.min(100),
    };
    // Upsert by name (case-insensitive) so re-saving overwrites in place.
    match presets
        .iter_mut()
        .find(|p| p.name.eq_ignore_ascii_case(&name))
    {
        Some(existing) => *existing = preset,
        None => presets.push(preset),
    }
    store_presets(&app, &presets)?;
    Ok(presets)
}

#[tauri::command]
pub fn delete_monitor_preset(
    window: tauri::WebviewWindow,
    app: AppHandle,
    name: String,
) -> Result<Vec<Preset>, String> {
    crate::commands::require_window(&window, &["main"])?;
    let mut presets = load_presets(&app);
    presets.retain(|p| !p.name.eq_ignore_ascii_case(&name));
    store_presets(&app, &presets)?;
    Ok(presets)
}

#[tauri::command]
pub fn apply_monitor_preset(
    window: tauri::WebviewWindow,
    app: AppHandle,
    name: String,
) -> Result<Vec<MonitorInfo>, String> {
    crate::commands::require_window(&window, &["main"])?;
    let presets = load_presets(&app);
    let preset = presets
        .into_iter()
        .find(|p| p.name.eq_ignore_ascii_case(&name))
        .ok_or_else(|| format!("preset '{name}' not found"))?;
    #[cfg(windows)]
    {
        Ok(apply_pcts(
            preset.brightness_pct,
            preset.contrast_pct,
            preset.red_gain_pct,
            preset.green_gain_pct,
            preset.blue_gain_pct,
        ))
    }
    #[cfg(not(windows))]
    {
        let _ = preset;
        Err("brightness control is only implemented on Windows".into())
    }
}
