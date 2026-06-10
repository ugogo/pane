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
    /// User key remaps, in insertion order (mirrors the on-disk + UI order).
    remaps: Vec<KeyRemap>,
    /// canonical source accelerator → raw target accelerator (dispatch lookup)
    remap_by_accel: HashMap<String, String>,
}

/// A user-defined "press source, send target" remap. Accelerators are kept in
/// the raw string form the frontend `ShortcutInput` emits (e.g. `Alt+V`).
#[derive(Clone, Serialize, Deserialize)]
struct KeyRemap {
    source: String,
    target: String,
}

static BINDINGS: Lazy<Mutex<Bindings>> = Lazy::new(|| Mutex::new(Bindings::default()));

const NEW_FILE: &str = "hotkeys.json";
const LEGACY_FILE: &str = "capture-hotkeys.json";

/// On-disk schema for `hotkeys.json`: action id → accelerator plus freeform key
/// remaps, with room for future per-action metadata behind the version field.
#[derive(Deserialize, Serialize)]
struct HotkeyFile {
    version: u32,
    bindings: HashMap<String, String>,
    /// `#[serde(default)]` keeps pre-remap `hotkeys.json` files loadable.
    #[serde(default)]
    remaps: Vec<KeyRemap>,
}

/// Bindings read off disk, before any OS registration. Splits the fixed action
/// set from the freeform remap list.
#[derive(Default)]
struct LoadedConfig {
    actions: HashMap<HotkeyAction, String>,
    remaps: Vec<KeyRemap>,
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

/// Drop remap entries with a blank source or target so a hand-edited or
/// partially-written file can't register garbage.
fn sanitize_remaps(remaps: Vec<KeyRemap>) -> Vec<KeyRemap> {
    remaps
        .into_iter()
        .filter_map(|r| {
            let source = r.source.trim();
            let target = r.target.trim();
            if source.is_empty() || target.is_empty() {
                None
            } else {
                Some(KeyRemap {
                    source: source.to_string(),
                    target: target.to_string(),
                })
            }
        })
        .collect()
}

/// Load persisted config, preferring `hotkeys.json` and falling back to a
/// one-time migration from the legacy `capture-hotkeys.json` (which has no
/// remaps).
fn load_config(app: &AppHandle) -> LoadedConfig {
    let Ok(dir) = config_dir(app) else {
        return LoadedConfig::default();
    };

    if let Ok(text) = fs::read_to_string(dir.join(NEW_FILE)) {
        if let Ok(file) = serde_json::from_str::<HotkeyFile>(&text) {
            return LoadedConfig {
                actions: decode_bindings(file.bindings),
                remaps: sanitize_remaps(file.remaps),
            };
        }
    }

    if let Ok(text) = fs::read_to_string(dir.join(LEGACY_FILE)) {
        if let Ok(legacy) = serde_json::from_str::<LegacyHotkeySettings>(&text) {
            return LoadedConfig {
                actions: migrate_legacy(&legacy),
                remaps: Vec::new(),
            };
        }
    }

    LoadedConfig::default()
}

fn write_settings(
    app: &AppHandle,
    actions: &HashMap<HotkeyAction, String>,
    remaps: &[KeyRemap],
) -> Result<(), String> {
    let raw = actions
        .iter()
        .map(|(action, accel)| (action.as_str().to_string(), accel.clone()))
        .collect();
    let file = HotkeyFile {
        version: 1,
        bindings: raw,
        remaps: remaps.to_vec(),
    };
    let path = config_dir(app)?.join(NEW_FILE);
    let text = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

/// Persist the current in-memory bindings and remaps to `hotkeys.json`.
fn save_settings(app: &AppHandle) -> Result<(), String> {
    let (actions, remaps) = {
        let b = BINDINGS.lock().unwrap();
        (b.by_action.clone(), b.remaps.clone())
    };
    write_settings(app, &actions, &remaps)
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

/// Register a remap's source accelerator and record it in [`BINDINGS`]. The
/// target is parsed up front so an unsynthesizable remap is rejected before it
/// claims an OS shortcut.
fn register_remap_binding(app: &AppHandle, remap: &KeyRemap) -> Result<(), String> {
    let canonical = canonical_accelerator(&remap.source)?;
    parse_chord(&remap.target)?;
    app.global_shortcut()
        .register(remap.source.as_str())
        .map_err(|e| e.to_string())?;
    let mut b = BINDINGS.lock().unwrap();
    b.remap_by_accel.insert(canonical, remap.target.clone());
    b.remaps.push(remap.clone());
    Ok(())
}

/// Restore persisted shortcuts and remaps at startup, completing any legacy
/// migration by rewriting the canonical `hotkeys.json` once loaded.
pub fn restore_hotkeys(app: &AppHandle) {
    let config = load_config(app);
    let shortcuts = app.global_shortcut();

    for (action, accelerator) in &config.actions {
        match shortcuts.register(accelerator.as_str()) {
            Ok(_) => {
                if let Err(e) = remember_binding(*action, accelerator.clone()) {
                    eprintln!("Failed to restore hotkey '{}': {}", accelerator, e);
                }
            }
            Err(e) => eprintln!("Failed to restore hotkey '{}': {}", accelerator, e),
        }
    }

    for remap in &config.remaps {
        if let Err(e) = register_remap_binding(app, remap) {
            eprintln!("Failed to restore remap '{}': {}", remap.source, e);
        }
    }

    // Persist the loaded set so a legacy migration is written to the new file
    // even when an OS registration failed for one of the accelerators.
    if !config.actions.is_empty() || !config.remaps.is_empty() {
        if let Err(e) = write_settings(app, &config.actions, &config.remaps) {
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
    let (action, remap_target) = match BINDINGS.lock() {
        Ok(b) => (
            b.by_accel.get(&accel).copied(),
            b.remap_by_accel.get(&accel).cloned(),
        ),
        Err(_) => return,
    };
    if let Some(action) = action {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = dispatch_hotkey(app, action).await {
                eprintln!("Hotkey dispatch failed: {e}");
            }
        });
    } else if let Some(target) = remap_target {
        send_remap_chord(&accel, &target);
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
        if b.remap_by_accel.contains_key(&canonical) {
            return Err("Shortcut already used by a key remap".to_string());
        }
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

// ── Key remaps ────────────────────────────────────────────────────────────
// A remap binds a source chord globally and, on press, synthesizes a different
// target chord — e.g. Alt+V → Ctrl+V. Sources share the conflict space with
// action accelerators; targets are validated by [`parse_chord`] up front.

/// One row in the remap list: the bound source chord and the chord it sends.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyRemapView {
    pub source: String,
    pub target: String,
}

#[tauri::command]
pub fn list_key_remaps() -> Vec<KeyRemapView> {
    let b = BINDINGS.lock().unwrap();
    b.remaps
        .iter()
        .map(|r| KeyRemapView {
            source: r.source.clone(),
            target: r.target.clone(),
        })
        .collect()
}

#[tauri::command]
pub fn add_key_remap(
    window: tauri::WebviewWindow,
    app: AppHandle,
    source: String,
    target: String,
) -> Result<KeyRemapView, String> {
    crate::commands::require_window(&window, &["main"])?;
    let remap = add_remap(&app, &source, &target)?;
    Ok(KeyRemapView {
        source: remap.source,
        target: remap.target,
    })
}

#[tauri::command]
pub fn remove_key_remap(
    window: tauri::WebviewWindow,
    app: AppHandle,
    source: String,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    remove_remap(&app, &source)
}

/// Validate, register, and persist a new remap. Rejects a source already owned
/// by an action or another remap, and a target Pane cannot synthesize.
fn add_remap(app: &AppHandle, source: &str, target: &str) -> Result<KeyRemap, String> {
    let source = source.trim();
    let target = target.trim();
    if source.is_empty() || target.is_empty() {
        return Err("A source and target shortcut are both required".to_string());
    }
    let canonical = canonical_accelerator(source)?;
    // Fail early if we can't turn the target into key events to send.
    parse_chord(target)?;

    {
        let b = BINDINGS.lock().unwrap();
        if let Some(existing) = b.by_accel.get(&canonical) {
            return Err(format!("Shortcut already bound to {}", existing.as_str()));
        }
        if b.remap_by_accel.contains_key(&canonical) {
            return Err("Shortcut is already remapped".to_string());
        }
    }

    app.global_shortcut()
        .register(source)
        .map_err(|e| format!("Failed to register '{}': {}", source, e))?;

    let remap = KeyRemap {
        source: source.to_string(),
        target: target.to_string(),
    };
    {
        let mut b = BINDINGS.lock().unwrap();
        b.remap_by_accel.insert(canonical, target.to_string());
        b.remaps.push(remap.clone());
    }
    save_settings(app)?;
    Ok(remap)
}

/// Remove the remap whose stored source matches `source`, unregistering its OS
/// shortcut. A no-op (Ok) when nothing matches.
fn remove_remap(app: &AppHandle, source: &str) -> Result<(), String> {
    let removed = {
        let mut b = BINDINGS.lock().unwrap();
        let before = b.remaps.len();
        b.remaps.retain(|r| r.source != source);
        let removed = b.remaps.len() != before;
        if removed {
            if let Ok(canonical) = canonical_accelerator(source) {
                b.remap_by_accel.remove(&canonical);
            }
        }
        removed
    };
    if removed {
        let _ = app.global_shortcut().unregister(source);
        save_settings(app)?;
    }
    Ok(())
}

// ── Chord parsing & synthesis ─────────────────────────────────────────────

/// A parsed accelerator: modifier virtual-key codes plus one main key code.
struct Chord {
    mods: Vec<u16>,
    key: u16,
}

/// Map a modifier token to its Windows virtual-key code (`None` if not a
/// modifier). `CmdOrCtrl` resolves to Ctrl on Windows.
fn modifier_vk(token: &str) -> Option<u16> {
    match token {
        "CmdOrCtrl" | "Ctrl" | "Control" => Some(0x11), // VK_CONTROL
        "Shift" => Some(0x10),                          // VK_SHIFT
        "Alt" | "Option" => Some(0x12),                 // VK_MENU
        "Super" | "Meta" | "Cmd" | "Command" | "Win" => Some(0x5B), // VK_LWIN
        _ => None,
    }
}

/// Map a non-modifier key token (as emitted by `ShortcutInput`) to its Windows
/// virtual-key code.
fn key_vk(token: &str) -> Option<u16> {
    if let Some(rest) = token.strip_prefix("num") {
        let mut chars = rest.chars();
        if let (Some(d), None) = (chars.next(), chars.next()) {
            if let Some(d) = d.to_digit(10) {
                return Some(0x60 + d as u16); // VK_NUMPAD0..9
            }
        }
    }
    if let Some(rest) = token.strip_prefix('F') {
        if let Ok(n) = rest.parse::<u16>() {
            if (1..=24).contains(&n) {
                return Some(0x6F + n); // VK_F1..VK_F24
            }
        }
    }
    if token.chars().count() == 1 {
        let c = token.chars().next().unwrap();
        if c.is_ascii_alphabetic() {
            return Some(c.to_ascii_uppercase() as u16); // VK_A..VK_Z == ASCII
        }
        if c.is_ascii_digit() {
            return Some(c as u16); // VK_0..VK_9 == ASCII
        }
        return match c {
            '-' => Some(0xBD),  // VK_OEM_MINUS
            '=' => Some(0xBB),  // VK_OEM_PLUS
            '[' => Some(0xDB),  // VK_OEM_4
            ']' => Some(0xDD),  // VK_OEM_6
            ';' => Some(0xBA),  // VK_OEM_1
            '\'' => Some(0xDE), // VK_OEM_7
            ',' => Some(0xBC),  // VK_OEM_COMMA
            '.' => Some(0xBE),  // VK_OEM_PERIOD
            '/' => Some(0xBF),  // VK_OEM_2
            '\\' => Some(0xDC), // VK_OEM_5
            '`' => Some(0xC0),  // VK_OEM_3
            _ => None,
        };
    }
    match token {
        "Space" => Some(0x20),
        "Enter" => Some(0x0D),
        "Tab" => Some(0x09),
        "Escape" => Some(0x1B),
        "Backspace" => Some(0x08),
        "Insert" => Some(0x2D),
        "Delete" => Some(0x2E),
        "Home" => Some(0x24),
        "End" => Some(0x23),
        "PageUp" => Some(0x21),
        "PageDown" => Some(0x22),
        "Up" => Some(0x26),
        "Down" => Some(0x28),
        "Left" => Some(0x25),
        "Right" => Some(0x27),
        _ => None,
    }
}

/// Parse a frontend accelerator (e.g. `CmdOrCtrl+Shift+V`) into modifier + key
/// virtual-key codes. Errors when a token is unrecognized or the chord has
/// zero / multiple main keys — so an unsynthesizable target is caught at bind
/// time rather than silently doing nothing on press.
fn parse_chord(accel: &str) -> Result<Chord, String> {
    let mut mods = Vec::new();
    let mut key = None;
    for token in accel.split('+').map(str::trim).filter(|t| !t.is_empty()) {
        if let Some(m) = modifier_vk(token) {
            if !mods.contains(&m) {
                mods.push(m);
            }
        } else if let Some(k) = key_vk(token) {
            if key.is_some() {
                return Err(format!("'{}' has more than one key", accel));
            }
            key = Some(k);
        } else {
            return Err(format!("Unrecognized key '{}'", token));
        }
    }
    let key = key.ok_or_else(|| format!("'{}' has no key", accel))?;
    Ok(Chord { mods, key })
}

/// Synthesize `target_accel` into the foreground app. Modifiers still physically
/// held from `source_accel` are released first, or e.g. Alt+V → Ctrl+V would
/// arrive as Ctrl+Alt+V.
#[cfg(windows)]
fn send_remap_chord(source_accel: &str, target_accel: &str) {
    // Leading `::` reaches the extern `windows` crate, not the local
    // `crate::commands::windows` module imported at the top of this file.
    use ::windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        VIRTUAL_KEY,
    };

    // Synthetic events carry this tag so the accent-popup low-level keyboard
    // hook ignores keys Pane injected itself (shared "PNAC" magic).
    const REINJECT_MAGIC: usize = 0x504E_4143;

    let target = match parse_chord(target_accel) {
        Ok(chord) => chord,
        Err(e) => {
            eprintln!("Remap target '{target_accel}' is invalid: {e}");
            return;
        }
    };
    let source_mods = parse_chord(source_accel)
        .map(|chord| chord.mods)
        .unwrap_or_default();

    fn key_input(vk: u16, keyup: bool, magic: usize) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(vk),
                    wScan: 0,
                    dwFlags: if keyup {
                        KEYEVENTF_KEYUP
                    } else {
                        KEYBD_EVENT_FLAGS(0)
                    },
                    time: 0,
                    dwExtraInfo: magic,
                },
            },
        }
    }

    let mut inputs: Vec<INPUT> = Vec::new();
    for &m in &source_mods {
        inputs.push(key_input(m, true, REINJECT_MAGIC));
    }
    for &m in &target.mods {
        inputs.push(key_input(m, false, REINJECT_MAGIC));
    }
    inputs.push(key_input(target.key, false, REINJECT_MAGIC));
    inputs.push(key_input(target.key, true, REINJECT_MAGIC));
    for &m in target.mods.iter().rev() {
        inputs.push(key_input(m, true, REINJECT_MAGIC));
    }
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

#[cfg(not(windows))]
fn send_remap_chord(_source_accel: &str, _target_accel: &str) {}

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

    #[test]
    fn parses_modifier_and_key_chords() {
        let chord = parse_chord("Alt+V").unwrap();
        assert_eq!(chord.mods, vec![0x12]); // VK_MENU
        assert_eq!(chord.key, 0x56); // VK_V

        let chord = parse_chord("CmdOrCtrl+Shift+C").unwrap();
        assert_eq!(chord.mods, vec![0x11, 0x10]); // VK_CONTROL, VK_SHIFT
        assert_eq!(chord.key, 0x43); // VK_C
    }

    #[test]
    fn parses_named_symbol_and_function_keys() {
        assert_eq!(parse_chord("F5").unwrap().key, 0x74); // VK_F5
        assert_eq!(parse_chord("Up").unwrap().key, 0x26); // VK_UP
        assert_eq!(parse_chord("CmdOrCtrl+-").unwrap().key, 0xBD); // VK_OEM_MINUS
        assert_eq!(parse_chord("num5").unwrap().key, 0x65); // VK_NUMPAD5
    }

    #[test]
    fn rejects_keyless_and_unknown_chords() {
        assert!(parse_chord("Ctrl+Shift").is_err());
        assert!(parse_chord("Ctrl+Nope").is_err());
        assert!(parse_chord("Ctrl+A+B").is_err());
    }

    #[test]
    fn sanitize_drops_blank_remaps() {
        let remaps = vec![
            KeyRemap {
                source: "Alt+V".to_string(),
                target: "CmdOrCtrl+V".to_string(),
            },
            KeyRemap {
                source: "  ".to_string(),
                target: "CmdOrCtrl+X".to_string(),
            },
            KeyRemap {
                source: "Alt+C".to_string(),
                target: "".to_string(),
            },
        ];
        let kept = sanitize_remaps(remaps);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].source, "Alt+V");
        assert_eq!(kept[0].target, "CmdOrCtrl+V");
    }

    #[test]
    fn hotkey_file_loads_without_remaps_field() {
        // Pre-remap files have no `remaps` key; serde(default) must fill it.
        let file: HotkeyFile =
            serde_json::from_str(r#"{"version":1,"bindings":{"capture-area":"Ctrl+Shift+2"}}"#)
                .unwrap();
        assert!(file.remaps.is_empty());
        assert_eq!(
            file.bindings.get("capture-area").map(String::as_str),
            Some("Ctrl+Shift+2")
        );
    }
}
