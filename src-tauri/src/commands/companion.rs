use axum::{
    extract::State,
    http::{header::AUTHORIZATION, HeaderMap, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::{
    fs,
    net::{TcpListener, UdpSocket},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, WebviewWindow};
use tokio::sync::broadcast;
use tokio::sync::oneshot;

use super::companion_snapshot::{
    build_snapshot, run_command, CompanionCommand, CompanionContext, CompanionSnapshot,
};
use crate::commands::require_window;

const PAIRING_TTL_SECONDS: u64 = 120;
const SERVICE_TYPE: &str = "_pane._tcp.local";

static ACTIVE_PAIRING: Lazy<Mutex<Option<CompanionPairingSession>>> =
    Lazy::new(|| Mutex::new(None));

/// Handle to the running companion HTTP server. `None` when the companion is
/// disabled. Slice 1 serves only the unauthenticated `GET /v1/hello` probe over
/// plain HTTP on the LAN; TLS and authenticated routes land in later slices.
static SERVER: Lazy<Mutex<Option<ServerHandle>>> = Lazy::new(|| Mutex::new(None));

struct ServerHandle {
    port: u16,
    shutdown: oneshot::Sender<()>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HelloResponse {
    name: String,
    version: String,
}

/// A paired device as persisted to disk. Holds the bearer `auth_token` the
/// device presents on every request — kept server-side only and never sent to
/// the webview (see [`CompanionDeviceInfo`]).
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompanionDevice {
    id: String,
    name: String,
    role: String,
    paired_at: u64,
    #[serde(default)]
    auth_token: String,
}

/// The public view of a paired device shown in the desktop UI. Deliberately
/// omits `auth_token`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionDeviceInfo {
    pub id: String,
    pub name: String,
    pub role: String,
    pub paired_at: u64,
}

impl From<&CompanionDevice> for CompanionDeviceInfo {
    fn from(device: &CompanionDevice) -> Self {
        CompanionDeviceInfo {
            id: device.id.clone(),
            name: device.name.clone(),
            role: device.role.clone(),
            paired_at: device.paired_at,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionPairingSession {
    pub pairing_id: String,
    pub pairing_uri: String,
    pub expires_at: u64,
    /// The one-time token a device must echo to `/v1/pair`. Skipped from the
    /// status payload (it's already embedded in `pairing_uri` for the QR).
    #[serde(skip)]
    token: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionStatus {
    pub enabled: bool,
    pub service_name: String,
    pub service_type: String,
    pub port: Option<u16>,
    pub paired_devices: Vec<CompanionDeviceInfo>,
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

// Path-based persistence core. The companion HTTP handlers capture the settings
// path (not an AppHandle) at server-start so they can load/save without a Tauri
// handle — which also makes them testable against a tempdir.
fn load_settings_at(path: &Path) -> CompanionSettings {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save_settings_at(path: &Path, settings: &CompanionSettings) -> Result<(), String> {
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

fn load_settings(app: &AppHandle) -> CompanionSettings {
    match settings_path(app) {
        Ok(path) => load_settings_at(&path),
        Err(_) => CompanionSettings::default(),
    }
}

fn save_settings(app: &AppHandle, settings: &CompanionSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    save_settings_at(&path, settings)
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
        port: server_port(),
        paired_devices: settings
            .paired_devices
            .iter()
            .map(CompanionDeviceInfo::from)
            .collect(),
        active_pairing: current_pairing(),
    }
}

/// Best-effort LAN IPv4 of this machine. Opens a UDP socket "connected" to a
/// public address so the OS picks the outbound interface; no packets are sent.
/// Falls back to loopback so the pairing URI is always well-formed.
fn local_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("8.8.8.8:80")?;
            Ok(socket.local_addr()?.ip().to_string())
        })
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn server_port() -> Option<u16> {
    SERVER.lock().unwrap().as_ref().map(|handle| handle.port)
}

/// Shared state for the companion routes. Carries the settings file path (not an
/// `AppHandle`) so handlers persist devices without a Tauri handle.
#[derive(Clone)]
struct CompanionState {
    hello: HelloResponse,
    settings_path: PathBuf,
    config_dir: PathBuf,
    /// Required at runtime for accent toggles; `None` only in unit tests.
    app: Option<AppHandle>,
    /// Bumped after each successful command so `/v1/events` clients refetch.
    event_tx: broadcast::Sender<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairRequest {
    token: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PairResponse {
    device_id: String,
    device_token: String,
}

#[derive(Serialize)]
struct CommandResponse {
    ok: bool,
}

/// Build the companion HTTP router. `/v1/hello` is unauthenticated; `/v1/pair`
/// exchanges the one-time pairing token for a bearer device token; `/v1/commands`
/// requires that bearer token.
fn build_router(state: CompanionState) -> Router {
    Router::new()
        .route("/v1/hello", get(hello_handler))
        .route("/v1/pair", post(pair_handler))
        .route("/v1/commands", post(commands_handler))
        .route("/v1/snapshot", get(snapshot_handler))
        .route("/v1/events", get(events_handler))
        .with_state(state)
}

async fn hello_handler(State(state): State<CompanionState>) -> Json<HelloResponse> {
    Json(state.hello)
}

async fn pair_handler(
    State(state): State<CompanionState>,
    Json(request): Json<PairRequest>,
) -> Result<Json<PairResponse>, ApiError> {
    consume_pairing_token(&request.token)?;

    let mut settings = load_settings_at(&state.settings_path);
    let device_id = random_hex(8);
    let device_token = random_hex(32);
    settings.paired_devices.push(CompanionDevice {
        id: device_id.clone(),
        name: request.name,
        role: "settings".to_string(),
        paired_at: now_epoch_seconds().map_err(ApiError::internal)?,
        auth_token: device_token.clone(),
    });
    save_settings_at(&state.settings_path, &settings).map_err(ApiError::internal)?;

    Ok(Json(PairResponse {
        device_id,
        device_token,
    }))
}

async fn commands_handler(
    State(state): State<CompanionState>,
    headers: HeaderMap,
    Json(command): Json<CompanionCommand>,
) -> Result<Json<CommandResponse>, ApiError> {
    authorize_request(&state, &headers)?;
    let ctx = companion_ctx(&state);
    tokio::task::spawn_blocking(move || run_command(&ctx, command))
        .await
        .map_err(ApiError::internal)?
        .map_err(ApiError::bad_request)?;
    let _ = state.event_tx.send(now_epoch_seconds().unwrap_or(0));
    Ok(Json(CommandResponse { ok: true }))
}

async fn snapshot_handler(
    State(state): State<CompanionState>,
    headers: HeaderMap,
) -> Result<Json<CompanionSnapshot>, ApiError> {
    authorize_request(&state, &headers)?;
    let ctx = companion_ctx(&state);
    let snapshot = tokio::task::spawn_blocking(move || build_snapshot(&ctx))
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(snapshot))
}

async fn events_handler(
    State(state): State<CompanionState>,
    headers: HeaderMap,
) -> Result<Sse<impl futures_core::Stream<Item = Result<Event, Infallible>>>, ApiError> {
    authorize_request(&state, &headers)?;
    let mut rx = state.event_tx.subscribe();
    let ctx = companion_ctx(&state);
    let stream = async_stream::stream! {
        yield Ok(Event::default().json_data(build_snapshot(&ctx)).unwrap());
        while let Ok(_) | Err(broadcast::error::RecvError::Lagged(_)) = rx.recv().await {
            yield Ok(Event::default().json_data(build_snapshot(&ctx)).unwrap());
        }
    };
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

fn companion_ctx(state: &CompanionState) -> CompanionContext {
    CompanionContext {
        config_dir: state.config_dir.clone(),
        app: state
            .app
            .clone()
            .expect("companion server started without AppHandle"),
    }
}

fn authorize_request(state: &CompanionState, headers: &HeaderMap) -> Result<(), ApiError> {
    let token = bearer_token(headers).ok_or_else(ApiError::unauthorized)?;
    let settings = load_settings_at(&state.settings_path);
    if authorize_device(&settings, &token).is_none() {
        return Err(ApiError::unauthorized());
    }
    Ok(())
}

/// Validate a device-supplied pairing token against the active session and, on
/// success, consume it (single-use). Expired sessions are cleared.
fn consume_pairing_token(token: &str) -> Result<(), ApiError> {
    let now = now_epoch_seconds().map_err(ApiError::internal)?;
    let mut guard = ACTIVE_PAIRING.lock().unwrap();

    let session = guard
        .as_ref()
        .ok_or_else(|| ApiError::bad_request("no active pairing session"))?;

    if session.expires_at <= now {
        *guard = None;
        return Err(ApiError::bad_request("pairing session expired"));
    }
    if session.token != token {
        return Err(ApiError::unauthorized());
    }

    *guard = None;
    Ok(())
}

/// Return the paired device id for a bearer token, or `None` if no enabled
/// device matches. Empty tokens never match (guards legacy records).
fn authorize_device(settings: &CompanionSettings, token: &str) -> Option<String> {
    if token.is_empty() {
        return None;
    }
    settings
        .paired_devices
        .iter()
        .find(|device| device.auth_token == token)
        .map(|device| device.id.clone())
}

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(str::to_string)
}

/// Minimal HTTP error carrying a status and message.
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn unauthorized() -> Self {
        ApiError {
            status: StatusCode::UNAUTHORIZED,
            message: "unauthorized".to_string(),
        }
    }

    fn bad_request(message: impl Into<String>) -> Self {
        ApiError {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    fn internal(error: impl std::fmt::Display) -> Self {
        ApiError {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: error.to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, self.message).into_response()
    }
}

/// Start the companion HTTP server if it isn't already running, returning the
/// bound port. Binds synchronously so the port is known before we build the
/// pairing URI, then hands the listener to the Tauri (tokio) runtime.
fn start_server(app: &AppHandle) -> Result<u16, String> {
    let mut guard = SERVER.lock().unwrap();
    if let Some(handle) = guard.as_ref() {
        return Ok(handle.port);
    }

    let listener = TcpListener::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let settings_path = settings_path(app)?;
    let config_dir = settings_path
        .parent()
        .ok_or_else(|| "companion settings path has no parent".to_string())?
        .to_path_buf();
    let (event_tx, _) = broadcast::channel(16);
    let state = CompanionState {
        hello: HelloResponse {
            name: service_name(&load_settings(app)),
            version: app.package_info().version.to_string(),
        },
        settings_path,
        config_dir,
        app: Some(app.clone()),
        event_tx,
    };
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => listener,
            Err(e) => {
                eprintln!("[companion] failed to adopt listener: {e}");
                return;
            }
        };
        let serve = axum::serve(listener, build_router(state)).with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        });
        if let Err(e) = serve.await {
            eprintln!("[companion] server error: {e}");
        }
    });

    *guard = Some(ServerHandle {
        port,
        shutdown: shutdown_tx,
    });
    Ok(port)
}

fn stop_server() {
    if let Some(handle) = SERVER.lock().unwrap().take() {
        let _ = handle.shutdown.send(());
    }
}

/// Called from Tauri setup so a companion that was left enabled comes back up on
/// launch.
pub fn init(app: &AppHandle) {
    if load_settings(app).enabled {
        if let Err(e) = start_server(app) {
            eprintln!("[companion] failed to start server on launch: {e}");
        }
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

    if enabled {
        start_server(&app)?;
    } else {
        *ACTIVE_PAIRING.lock().unwrap() = None;
        stop_server();
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

    let port = start_server(&app)?;
    let host = local_ip();
    let pairing_id = random_hex(8);
    let token = random_hex(32);
    let expires_at = now_epoch_seconds()? + PAIRING_TTL_SECONDS;
    let instance = service_name(&settings);
    let pairing_uri = format!(
        "pane://pair?v=1&transport=lan&service={SERVICE_TYPE}&instance={instance}&host={host}&port={port}&pairingId={pairing_id}&token={token}&expiresAt={expires_at}"
    );

    *ACTIVE_PAIRING.lock().unwrap() = Some(CompanionPairingSession {
        pairing_id,
        pairing_uri,
        expires_at,
        token,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpStream;

    fn test_state() -> CompanionState {
        let settings_path = std::env::temp_dir().join("pane-companion-test-hello.json");
        let config_dir = settings_path.parent().unwrap().to_path_buf();
        let (event_tx, _) = broadcast::channel(1);
        CompanionState {
            hello: HelloResponse {
                name: "Pane-testbed".to_string(),
                version: "9.9.9".to_string(),
            },
            settings_path,
            config_dir,
            app: None,
            event_tx,
        }
    }

    fn device(id: &str, token: &str) -> CompanionDevice {
        CompanionDevice {
            id: id.to_string(),
            name: "iPhone".to_string(),
            role: "settings".to_string(),
            paired_at: 0,
            auth_token: token.to_string(),
        }
    }

    fn set_pairing(token: &str, expires_at: u64) {
        *ACTIVE_PAIRING.lock().unwrap() = Some(CompanionPairingSession {
            pairing_id: "p".to_string(),
            pairing_uri: String::new(),
            expires_at,
            token: token.to_string(),
        });
    }

    // Drives the real router over a real socket: serve on an ephemeral port,
    // then issue a plain HTTP/1.1 GET and assert the body carries the hello
    // metadata. Keeps the client std-only so no extra tokio io features or
    // HTTP-client deps are needed.
    #[test]
    fn hello_route_serves_metadata() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_io()
            .build()
            .unwrap();

        runtime.block_on(async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let port = listener.local_addr().unwrap().port();

            tokio::spawn(async move {
                let _ = axum::serve(listener, build_router(test_state())).await;
            });

            let response = tokio::task::spawn_blocking(move || http_get(port, "/v1/hello"))
                .await
                .unwrap();

            assert!(
                response.starts_with("HTTP/1.1 200"),
                "expected 200, got: {response}"
            );
            assert!(response.contains("\"name\":\"Pane-testbed\""));
            assert!(response.contains("\"version\":\"9.9.9\""));
        });
    }

    #[test]
    fn pairing_token_is_validated_single_use_and_expiring() {
        // No session at all rejects.
        *ACTIVE_PAIRING.lock().unwrap() = None;
        assert!(consume_pairing_token("anything").is_err());

        let now = now_epoch_seconds().unwrap();

        // A wrong token is rejected but leaves the session intact for a retry.
        set_pairing("good", now + 60);
        assert!(consume_pairing_token("bad").is_err());
        assert!(consume_pairing_token("good").is_ok());
        // Single-use: the now-consumed session can't be reused.
        assert!(consume_pairing_token("good").is_err());

        // Expired sessions are rejected and cleared.
        set_pairing("stale", now - 1);
        assert!(consume_pairing_token("stale").is_err());
        assert!(ACTIVE_PAIRING.lock().unwrap().is_none());
    }

    #[test]
    fn authorize_device_matches_only_known_nonempty_tokens() {
        let settings = CompanionSettings {
            enabled: true,
            install_id: Some("id".to_string()),
            paired_devices: vec![device("d1", "secret")],
        };

        assert_eq!(
            authorize_device(&settings, "secret"),
            Some("d1".to_string())
        );
        assert!(authorize_device(&settings, "wrong").is_none());
        // An empty bearer must never match a legacy record with an empty token.
        assert!(authorize_device(&settings, "").is_none());
    }

    #[test]
    fn command_envelope_only_accepts_allowlisted_types() {
        let parsed: CompanionCommand =
            serde_json::from_str(r#"{"type":"set_brightness","value":40}"#).unwrap();
        assert!(matches!(
            parsed,
            CompanionCommand::SetBrightness { value: 40 }
        ));

        // Anything outside the allowlist (capture, clipboard, arbitrary IPC)
        // fails to decode and so can never reach the command dispatch.
        assert!(serde_json::from_str::<CompanionCommand>(r#"{"type":"capture_screen"}"#).is_err());
        assert!(serde_json::from_str::<CompanionCommand>(
            r#"{"type":"clipboard_write","text":"x"}"#
        )
        .is_err());

        let preset: CompanionCommand =
            serde_json::from_str(r#"{"type":"apply_monitor_preset","name":"Night"}"#).unwrap();
        assert!(matches!(
            preset,
            CompanionCommand::ApplyMonitorPreset { name } if name == "Night"
        ));
    }

    fn http_get(port: u16, path: &str) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(
            stream,
            "GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
        )
        .unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        response
    }
}
