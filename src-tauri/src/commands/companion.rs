use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, WebviewWindow};

use crate::commands::require_window;

const PAIRING_TTL_SECONDS: u64 = 120;
const SERVICE_TYPE: &str = "_pane._tcp.local";

static ACTIVE_PAIRING: Lazy<Mutex<Option<CompanionPairingSession>>> =
    Lazy::new(|| Mutex::new(None));

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionDevice {
    pub id: String,
    pub name: String,
    pub role: String,
    pub paired_at: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionPairingSession {
    pub pairing_id: String,
    pub pairing_uri: String,
    pub expires_at: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionStatus {
    pub enabled: bool,
    pub service_name: String,
    pub service_type: String,
    pub paired_devices: Vec<CompanionDevice>,
    pub active_pairing: Option<CompanionPairingSession>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompanionSettings {
    enabled: bool,
    install_id: Option<String>,
    paired_devices: Vec<CompanionDevice>,
}

fn now_epoch_seconds() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|e| e.to_string())
}

fn random_hex(bytes: usize) -> String {
    let mut out = String::with_capacity(bytes * 2);

    while out.len() < bytes * 2 {
        for byte in rand::random::<[u8; 16]>() {
            out.push_str(&format!("{byte:02x}"));
            if out.len() == bytes * 2 {
                break;
            }
        }
    }

    out
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("companion.json"))
}

fn load_settings(app: &AppHandle) -> CompanionSettings {
    let Ok(path) = settings_path(app) else {
        return CompanionSettings::default();
    };

    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save_settings(app: &AppHandle, settings: &CompanionSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

fn load_or_create_settings(app: &AppHandle) -> Result<CompanionSettings, String> {
    let mut settings = load_settings(app);

    if settings.install_id.is_none() {
        settings.install_id = Some(random_hex(16));
        save_settings(app, &settings)?;
    }

    Ok(settings)
}

fn service_name(settings: &CompanionSettings) -> String {
    let install_id = settings.install_id.as_deref().unwrap_or("local");
    let suffix = install_id.get(0..8).unwrap_or(install_id);
    format!("Pane-{suffix}")
}

fn current_pairing() -> Option<CompanionPairingSession> {
    let now = now_epoch_seconds().ok()?;
    let mut pairing = ACTIVE_PAIRING.lock().unwrap();

    if pairing
        .as_ref()
        .is_some_and(|session| session.expires_at <= now)
    {
        *pairing = None;
    }

    pairing.clone()
}

fn status_from_settings(settings: CompanionSettings) -> CompanionStatus {
    CompanionStatus {
        enabled: settings.enabled,
        service_name: service_name(&settings),
        service_type: SERVICE_TYPE.to_string(),
        paired_devices: settings.paired_devices,
        active_pairing: current_pairing(),
    }
}

#[tauri::command]
pub fn get_companion_status(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<CompanionStatus, String> {
    require_window(&window, &["main"])?;
    load_or_create_settings(&app).map(status_from_settings)
}

#[tauri::command]
pub fn set_companion_enabled(
    window: WebviewWindow,
    app: AppHandle,
    enabled: bool,
) -> Result<CompanionStatus, String> {
    require_window(&window, &["main"])?;

    let mut settings = load_or_create_settings(&app)?;
    settings.enabled = enabled;
    save_settings(&app, &settings)?;

    if !enabled {
        *ACTIVE_PAIRING.lock().unwrap() = None;
    }

    Ok(status_from_settings(settings))
}

#[tauri::command]
pub fn start_companion_pairing(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<CompanionStatus, String> {
    require_window(&window, &["main"])?;

    let mut settings = load_or_create_settings(&app)?;
    settings.enabled = true;
    save_settings(&app, &settings)?;

    let pairing_id = random_hex(8);
    let token = random_hex(32);
    let expires_at = now_epoch_seconds()? + PAIRING_TTL_SECONDS;
    let instance = service_name(&settings);
    let pairing_uri = format!(
        "pane://pair?v=1&transport=lan&service={SERVICE_TYPE}&instance={instance}&pairingId={pairing_id}&token={token}&expiresAt={expires_at}"
    );

    *ACTIVE_PAIRING.lock().unwrap() = Some(CompanionPairingSession {
        pairing_id,
        pairing_uri,
        expires_at,
    });

    Ok(status_from_settings(settings))
}

#[tauri::command]
pub fn cancel_companion_pairing(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<CompanionStatus, String> {
    require_window(&window, &["main"])?;
    *ACTIVE_PAIRING.lock().unwrap() = None;

    load_or_create_settings(&app).map(status_from_settings)
}

#[tauri::command]
pub fn revoke_companion_device(
    window: WebviewWindow,
    app: AppHandle,
    device_id: String,
) -> Result<CompanionStatus, String> {
    require_window(&window, &["main"])?;

    let mut settings = load_or_create_settings(&app)?;
    settings
        .paired_devices
        .retain(|device| device.id != device_id);
    save_settings(&app, &settings)?;

    Ok(status_from_settings(settings))
}
