//! Ambient screen sync — drive the DX Light bias strip from the on-screen color
//! of the primary monitor (an Ambilight effect).
//!
//! The strip is split into N horizontal zones (left → right), each driven by the
//! representative color of the matching vertical slice of the screen, in a
//! single multi-segment packet per frame. The strip is opened once and the HID
//! handle reused for the life of the loop (re-enumerating HID every frame is far
//! too heavy). Frames come from a persistent DXGI Desktop Duplication session
//! (see [`desktop_duplication`](crate::commands::desktop_duplication)) — opened
//! once, then `AcquireNextFrame` each loop — which is ~30× faster than xcap's
//! per-call capture; xcap remains a fallback. Per-zone colors are exponentially
//! smoothed (frame-rate-independent) so transitions feel fluid, not strobing.
//!
//! Brightness, saturation, zone count, and frame rate are all live-tunable from
//! the UI without tearing the loop down. The MSI / Dynamic Lighting targets
//! remain out of scope here — see the follow-up plan.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use once_cell::sync::{Lazy, OnceCell};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::commands::desktop_duplication::DesktopDuplicator;
use crate::commands::{capture, dx_light, light_state};

/// Where ambient frames come from. Desktop Duplication is the fast persistent
/// path; xcap is the fallback if duplication can't initialize (unusual GPU
/// setups, HDR formats we don't decode).
enum CaptureSource {
    Dupl(DesktopDuplicator),
    Xcap(xcap::Monitor),
}

/// Default capture/push rate, and the ceiling the slider allows. The loop
/// self-limits if a frame takes longer than the budget, so a high ceiling is
/// safe — it just won't be reached when capture is the bottleneck.
const DEFAULT_FPS: u32 = 30;
const MIN_FPS: u32 = 1;
const MAX_FPS: u32 = 60;

/// Smoothing time constant, in seconds. The per-frame blend factor is derived
/// from this and the real time since the last frame, so the *feel* of the color
/// chase stays constant regardless of frame rate — fps then only controls update
/// granularity, not how fast colors settle. ~0.1s matches the old fixed 0.35/frame
/// blend at the default 24 fps.
const SMOOTHING_TAU: f64 = 0.1;

/// Default overall strip level (0..1).
const DEFAULT_BRIGHTNESS: f64 = 0.6;

/// Default saturation boost (1.0 = untouched, higher = punchier hue).
const DEFAULT_SATURATION: f64 = 1.5;

/// Default zone count — multi-zone out of the box. One zone reproduces the old
/// single-color behavior.
const DEFAULT_ZONES: usize = 5;

/// Default white-balance warmth. RGB strips with no dedicated white LED render
/// equal R=G=B as a blue-ish white because the blue die is disproportionately
/// bright; warmth attenuates green and blue to pull that back toward neutral.
/// Calibrated to ~1.5 for this strip, where a full-white screen reads neutral.
const DEFAULT_WARMTH: f64 = 1.5;

/// Warmth ceiling. Allows pushing past the calibrated point in case true neutral
/// (or a deliberately warm look) sits beyond it. At 2.0, blue is fully cut.
const WARMTH_MAX: f64 = 2.0;

/// How much of each channel warmth removes per unit. Blue is cut hardest since
/// it's the dominant cause of the cold cast; green gets a lighter trim. At
/// warmth 1.0 this is green ×0.75, blue ×0.5.
const WARMTH_GREEN_CUT: f64 = 0.25;
const WARMTH_BLUE_CUT: f64 = 0.5;

// ── Persisted settings ─────────────────────────────────────────────────────────

/// Screen-sync tuning, persisted so it survives restarts. Units match the
/// loop's internal ones: `brightness` and `warmth`/`saturation` are factors
/// (not percentages), `zones`/`fps` are counts.
#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AmbientSettings {
    #[serde(default = "default_brightness")]
    pub brightness: f64,
    #[serde(default = "default_saturation")]
    pub saturation: f64,
    #[serde(default = "default_warmth")]
    pub warmth: f64,
    #[serde(default = "default_zones")]
    pub zones: usize,
    #[serde(default = "default_fps")]
    pub fps: u32,
}

fn default_brightness() -> f64 {
    DEFAULT_BRIGHTNESS
}
fn default_saturation() -> f64 {
    DEFAULT_SATURATION
}
fn default_warmth() -> f64 {
    DEFAULT_WARMTH
}
fn default_zones() -> usize {
    DEFAULT_ZONES
}
fn default_fps() -> u32 {
    DEFAULT_FPS
}

impl Default for AmbientSettings {
    fn default() -> Self {
        Self {
            brightness: DEFAULT_BRIGHTNESS,
            saturation: DEFAULT_SATURATION,
            warmth: DEFAULT_WARMTH,
            zones: DEFAULT_ZONES,
            fps: DEFAULT_FPS,
        }
    }
}

impl AmbientSettings {
    /// Clamp every field into its valid range (called before use/persist).
    fn sanitized(self) -> Self {
        Self {
            brightness: self.brightness.clamp(0.0, 1.0),
            saturation: self.saturation.max(0.0),
            warmth: self.warmth.clamp(0.0, WARMTH_MAX),
            zones: self.zones.clamp(1, dx_light::MAX_ZONES),
            fps: self.fps.clamp(MIN_FPS, MAX_FPS),
        }
    }
}

/// In-memory copy of the persisted settings, seeded from disk on first access.
static SETTINGS: Lazy<Mutex<AmbientSettings>> =
    Lazy::new(|| Mutex::new(load_settings().unwrap_or_default()));

/// Identifier-scoped storage dir, bound once at startup (mirrors `light_state`).
static SETTINGS_DIR: OnceCell<PathBuf> = OnceCell::new();

/// Bind settings storage to the identifier-scoped local data dir. Called once
/// from Tauri `setup` before any ambient command can run.
pub fn init_storage(app: &AppHandle) {
    match app.path().app_local_data_dir() {
        Ok(dir) => {
            let _ = SETTINGS_DIR.set(dir);
        }
        Err(e) => eprintln!("[ambient] could not resolve local data dir: {e}"),
    }
}

fn settings_path() -> Option<PathBuf> {
    if let Some(dir) = SETTINGS_DIR.get() {
        return Some(dir.join("ambient-sync.json"));
    }
    let local = std::env::var_os("LOCALAPPDATA")?;
    Some(PathBuf::from(local).join("Pane").join("ambient-sync.json"))
}

fn load_settings() -> Option<AmbientSettings> {
    let path = settings_path()?;
    let data = fs::read_to_string(&path).ok()?;
    serde_json::from_str::<AmbientSettings>(&data)
        .ok()
        .map(AmbientSettings::sanitized)
}

fn persist_settings(settings: &AmbientSettings) {
    let Some(path) = settings_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(&path, json);
    }
}

fn current_settings() -> AmbientSettings {
    *SETTINGS.lock().unwrap()
}

/// Managed Tauri state: the currently running sync loop, if any.
#[derive(Default)]
pub struct AmbientSync(Mutex<Option<Worker>>);

struct Worker {
    running: Arc<AtomicBool>,
    /// Shared so the sliders can retune a live loop without the cost of tearing
    /// the worker down and re-opening the strip.
    brightness: Arc<Mutex<f64>>,
    saturation: Arc<Mutex<f64>>,
    warmth: Arc<Mutex<f64>>,
    zones: Arc<AtomicUsize>,
    fps: Arc<AtomicU32>,
    join: Option<JoinHandle<()>>,
}

impl AmbientSync {
    fn is_running(&self) -> bool {
        self.0
            .lock()
            .unwrap()
            .as_ref()
            .map(|w| w.running.load(Ordering::Relaxed))
            .unwrap_or(false)
    }
}

/// Representative per-zone colors in a single strided pass over a raw pixel
/// buffer (BGRA from duplication, RGBA from xcap), bucketing each sampled pixel
/// into a zone by its x coordinate.
///
/// Within a zone a flat mean of a mostly white/grey region collapses to a
/// washed-out pastel, so each pixel is weighted by its saturation (squared):
/// grey UI chrome barely counts while genuinely colorful content drives the hue.
/// A plain mean is kept as a fallback for (near-)greyscale zones so we still emit
/// a sane neutral instead of dividing by ~zero. A final saturation boost keeps
/// the result lively on the strip.
/// A raw captured frame: a flat pixel buffer plus how to read it. `row_pitch` is
/// the byte stride per row (duplication pads it), and `bgra` selects channel
/// order (duplication is BGRA, xcap RGBA).
struct RawFrame<'a> {
    data: &'a [u8],
    width: usize,
    height: usize,
    row_pitch: usize,
    bgra: bool,
}

fn zone_colors_raw(
    frame: &RawFrame<'_>,
    zones: usize,
    saturation: f64,
    warmth: f64,
) -> Vec<(u8, u8, u8)> {
    let RawFrame {
        data,
        width,
        height,
        row_pitch,
        bgra,
    } = *frame;
    let zones = zones.clamp(1, dx_light::MAX_ZONES);
    if width == 0 || height == 0 {
        return vec![(0, 0, 0); zones];
    }
    let total = width * height;

    // Saturation-weighted accumulators plus a plain-mean fallback, per zone.
    let mut wr = vec![0f64; zones];
    let mut wg = vec![0f64; zones];
    let mut wb = vec![0f64; zones];
    let mut wsum = vec![0f64; zones];
    let mut mr = vec![0f64; zones];
    let mut mg = vec![0f64; zones];
    let mut mb = vec![0f64; zones];
    let mut mn = vec![0f64; zones];

    // Aim for ~2k samples per zone regardless of resolution.
    let stride = (total / (2048 * zones)).max(1);
    let mut idx = 0;
    while idx < total {
        let x = idx % width;
        let y = idx / width;
        let z = (x * zones / width).min(zones - 1);
        // Honor the row pitch (duplication's staging rows are padded) and the
        // channel order (duplication hands back BGRA; xcap RGBA).
        let base = y * row_pitch + x * 4;
        let (r, g, b) = if bgra {
            (
                data[base + 2] as f64,
                data[base + 1] as f64,
                data[base] as f64,
            )
        } else {
            (
                data[base] as f64,
                data[base + 1] as f64,
                data[base + 2] as f64,
            )
        };

        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        let sat = if max > 0.0 { (max - min) / max } else { 0.0 };
        // sat^2 so a few vivid regions win decisively over a large field of
        // faintly-tinted whites.
        let weight = sat * sat;
        wr[z] += r * weight;
        wg[z] += g * weight;
        wb[z] += b * weight;
        wsum[z] += weight;

        mr[z] += r;
        mg[z] += g;
        mb[z] += b;
        mn[z] += 1.0;
        idx += stride;
    }

    (0..zones)
        .map(|z| {
            let (r, g, b) = if wsum[z] > 1e-3 {
                (wr[z] / wsum[z], wg[z] / wsum[z], wb[z] / wsum[z])
            } else if mn[z] > 0.0 {
                (mr[z] / mn[z], mg[z] / mn[z], mb[z] / mn[z])
            } else {
                (0.0, 0.0, 0.0)
            };
            apply_warmth(boost_saturation(r, g, b, saturation), warmth)
        })
        .collect()
}

/// White-balance correction: attenuate green and (more so) blue to neutralize
/// the cold blue-white that RGB-only strips produce at equal channels. `warmth`
/// of 0 passes color through untouched.
fn apply_warmth((r, g, b): (u8, u8, u8), warmth: f64) -> (u8, u8, u8) {
    let w = warmth.clamp(0.0, WARMTH_MAX);
    let scale = |c: u8, cut: f64| (c as f64 * (1.0 - w * cut)).clamp(0.0, 255.0).round() as u8;
    (r, scale(g, WARMTH_GREEN_CUT), scale(b, WARMTH_BLUE_CUT))
}

/// Luma-preserving saturation boost: push each channel away from the color's
/// luminance by `factor`, punching up the hue without changing how bright the
/// strip reads (the brightness slider owns overall level).
fn boost_saturation(r: f64, g: f64, b: f64, factor: f64) -> (u8, u8, u8) {
    let luma = 0.299 * r + 0.587 * g + 0.114 * b;
    let push = |c: f64| (luma + (c - luma) * factor).clamp(0.0, 255.0).round() as u8;
    (push(r), push(g), push(b))
}

fn run_loop(
    running: Arc<AtomicBool>,
    brightness: Arc<Mutex<f64>>,
    saturation: Arc<Mutex<f64>>,
    warmth: Arc<Mutex<f64>>,
    zones: Arc<AtomicUsize>,
    fps: Arc<AtomicU32>,
) {
    // Open the strip once and keep `api` alive for the whole loop (the handle
    // borrows from it). Bail out — leaving `running` flipped off — if either
    // the device or the monitor can't be acquired.
    let api = match hidapi::HidApi::new() {
        Ok(api) => api,
        Err(e) => {
            eprintln!("[ambient] hidapi init failed: {e}");
            running.store(false, Ordering::Relaxed);
            return;
        }
    };
    let handle = match dx_light::open_device(&api) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("[ambient] could not open DX Light: {e}");
            running.store(false, Ordering::Relaxed);
            return;
        }
    };
    // Prefer the persistent DXGI duplication path; fall back to xcap only if it
    // can't initialize, so the feature still works on setups duplication rejects.
    let mut source = match DesktopDuplicator::new() {
        Ok(d) => CaptureSource::Dupl(d),
        Err(e) => {
            eprintln!("[ambient] desktop duplication unavailable ({e}); falling back to xcap");
            match capture::primary_monitor() {
                Ok(m) => CaptureSource::Xcap(m),
                Err(e2) => {
                    eprintln!("[ambient] no monitor to sync: {e2}");
                    running.store(false, Ordering::Relaxed);
                    return;
                }
            }
        }
    };

    // Latest sampled per-zone colors; smoothing chases this. Held across frames so
    // a "no new frame" result (static screen) keeps converging toward it.
    let mut target: Vec<(u8, u8, u8)> = Vec::new();
    // Per-zone smoothed colors; reset whenever the zone count changes.
    let mut smooth: Vec<(f64, f64, f64)> = Vec::new();
    // Resend brightness/zones only when they actually change. With duplication a
    // static screen loops at full fps, so this skips a flood of identical packets
    // once colors have settled.
    let mut last_brightness: Option<f64> = None;
    let mut last_out: Option<Vec<(u8, u8, u8)>> = None;
    // Wall-clock of the previous iteration, for frame-rate-independent smoothing.
    let mut last_frame = Instant::now();

    while running.load(Ordering::Relaxed) {
        let started = Instant::now();
        // Real elapsed time since the last frame drives the blend factor, so the
        // settle time is the same whether we're running at 5 or 60 fps.
        let dt = started.duration_since(last_frame).as_secs_f64();
        last_frame = started;
        let alpha = if dt > 0.0 {
            1.0 - (-dt / SMOOTHING_TAU).exp()
        } else {
            1.0
        };
        let sat = *saturation.lock().unwrap();
        let warm = *warmth.lock().unwrap();
        let level = *brightness.lock().unwrap();
        let zone_count = zones.load(Ordering::Relaxed).clamp(1, dx_light::MAX_ZONES);
        let fps_now = fps.load(Ordering::Relaxed).clamp(MIN_FPS, MAX_FPS);
        let frame = Duration::from_secs_f64(1.0 / fps_now as f64);

        // Block up to roughly one frame budget waiting for a new frame, so the
        // wait itself paces a static screen instead of busy-spinning.
        let timeout_ms = (frame.as_millis() as u32).max(1);
        let mut new_colors: Option<Vec<(u8, u8, u8)>> = None;
        let mut lost: Option<String> = None;
        match &mut source {
            CaptureSource::Dupl(d) => {
                if let Err(e) = d.next_frame(timeout_ms, |data, w, h, pitch| {
                    new_colors = Some(zone_colors_raw(
                        &RawFrame {
                            data,
                            width: w as usize,
                            height: h as usize,
                            row_pitch: pitch as usize,
                            bgra: true,
                        },
                        zone_count,
                        sat,
                        warm,
                    ));
                }) {
                    lost = Some(e);
                }
            }
            CaptureSource::Xcap(m) => match m.capture_image() {
                Ok(img) => {
                    new_colors = Some(zone_colors_raw(
                        &RawFrame {
                            data: img.as_raw(),
                            width: img.width() as usize,
                            height: img.height() as usize,
                            row_pitch: img.width() as usize * 4,
                            bgra: false,
                        },
                        zone_count,
                        sat,
                        warm,
                    ));
                }
                Err(e) => lost = Some(e.to_string()),
            },
        }

        if let Some(e) = lost {
            // A lost duplication session (mode change, secure desktop, resolution
            // switch, or a GPU reset / device-removed) is recoverable — rebuild it
            // and retry next frame. An xcap failure stays fatal, as before.
            if matches!(source, CaptureSource::Dupl(_)) {
                match DesktopDuplicator::new() {
                    Ok(d) => {
                        eprintln!("[ambient] capture lost ({e}); duplication rebuilt");
                        source = CaptureSource::Dupl(d);
                    }
                    Err(e2) => {
                        // The GPU is still recovering (a TDR reset can take a
                        // second or two). Don't kill the loop — back off briefly
                        // and keep retrying so sync resumes once the device is
                        // back, instead of silently dying until the user restarts.
                        eprintln!("[ambient] capture lost ({e}); rebuild failed ({e2}); retrying");
                        std::thread::sleep(Duration::from_millis(500));
                    }
                }
            } else {
                eprintln!("[ambient] capture failed: {e}");
                break;
            }
            continue;
        }

        // A fresh frame updates the target; a "no new frame" result leaves it,
        // so smoothing keeps converging toward the last seen colors.
        if let Some(colors) = new_colors {
            target = colors;
        }

        if !target.is_empty() {
            if smooth.len() != target.len() {
                smooth = target
                    .iter()
                    .map(|&(r, g, b)| (r as f64, g as f64, b as f64))
                    .collect();
            } else {
                for (s, &(r, g, b)) in smooth.iter_mut().zip(target.iter()) {
                    s.0 += (r as f64 - s.0) * alpha;
                    s.1 += (g as f64 - s.1) * alpha;
                    s.2 += (b as f64 - s.2) * alpha;
                }
            }

            if last_brightness.is_none_or(|b| (b - level).abs() > 1e-3) {
                if let Err(e) = dx_light::write_brightness(&handle, level) {
                    eprintln!("[ambient] brightness write failed: {e}");
                    break;
                }
                last_brightness = Some(level);
            }

            let out: Vec<(u8, u8, u8)> = smooth
                .iter()
                .map(|&(r, g, b)| (r.round() as u8, g.round() as u8, b.round() as u8))
                .collect();
            if last_out.as_deref() != Some(out.as_slice()) {
                if let Err(e) = dx_light::write_zones(&handle, &out) {
                    eprintln!("[ambient] strip write failed: {e}");
                    break;
                }
                last_out = Some(out);
            }
        }

        let elapsed = started.elapsed();
        if elapsed < frame {
            std::thread::sleep(frame - elapsed);
        }
    }

    running.store(false, Ordering::Relaxed);
    restore_dxlight();
}

/// On stop, return the strip to the user's last persisted manual color (or off)
/// so it doesn't freeze on whatever frame happened to be on screen.
fn restore_dxlight() {
    let states = light_state::snapshot();
    let Some(state) = states.get("dxlight") else {
        return;
    };
    let result = if state.on {
        dx_light::apply_dx_light_inner(state.r, state.g, state.b, state.brightness)
    } else {
        dx_light::dx_light_off_inner()
    };
    if let Err(e) = result {
        eprintln!("[ambient] failed to restore DX Light after sync: {e}");
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn start_ambient_sync(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AmbientSync>,
    brightness: f64,
    saturation: Option<f64>,
    warmth: Option<f64>,
    zones: Option<usize>,
    fps: Option<u32>,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;

    let mut guard = state.0.lock().unwrap();
    // Reap a previous loop that exited on its own (device unplugged, capture
    // error) before deciding whether one is already live.
    if let Some(worker) = guard.as_ref() {
        if !worker.running.load(Ordering::Relaxed) {
            if let Some(mut worker) = guard.take() {
                if let Some(join) = worker.join.take() {
                    let _ = join.join();
                }
            }
        }
    }
    if guard.is_some() {
        // Already running — let the caller stop/start to change settings.
        return Ok(());
    }

    let running = Arc::new(AtomicBool::new(true));
    let thread_running = running.clone();
    let brightness = Arc::new(Mutex::new(brightness.clamp(0.0, 1.0)));
    let thread_brightness = brightness.clone();
    let saturation = Arc::new(Mutex::new(
        saturation.unwrap_or(DEFAULT_SATURATION).max(0.0),
    ));
    let thread_saturation = saturation.clone();
    let warmth = Arc::new(Mutex::new(
        warmth.unwrap_or(DEFAULT_WARMTH).clamp(0.0, WARMTH_MAX),
    ));
    let thread_warmth = warmth.clone();
    let zones = Arc::new(AtomicUsize::new(
        zones.unwrap_or(DEFAULT_ZONES).clamp(1, dx_light::MAX_ZONES),
    ));
    let thread_zones = zones.clone();
    let fps = Arc::new(AtomicU32::new(
        fps.unwrap_or(DEFAULT_FPS).clamp(MIN_FPS, MAX_FPS),
    ));
    let thread_fps = fps.clone();
    let join = std::thread::Builder::new()
        .name("ambient-sync".into())
        .spawn(move || {
            run_loop(
                thread_running,
                thread_brightness,
                thread_saturation,
                thread_warmth,
                thread_zones,
                thread_fps,
            )
        })
        .map_err(|e| format!("Failed to start ambient sync thread: {e}"))?;

    *guard = Some(Worker {
        running,
        brightness,
        saturation,
        warmth,
        zones,
        fps,
        join: Some(join),
    });
    Ok(())
}

/// Retune a live loop's brightness without restarting it. No-op if nothing is
/// running.
#[tauri::command]
pub fn set_ambient_brightness(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AmbientSync>,
    brightness: f64,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    if let Some(worker) = state.0.lock().unwrap().as_ref() {
        *worker.brightness.lock().unwrap() = brightness.clamp(0.0, 1.0);
    }
    Ok(())
}

/// Retune a live loop's saturation boost without restarting it. No-op if
/// nothing is running.
#[tauri::command]
pub fn set_ambient_saturation(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AmbientSync>,
    saturation: f64,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    if let Some(worker) = state.0.lock().unwrap().as_ref() {
        *worker.saturation.lock().unwrap() = saturation.max(0.0);
    }
    Ok(())
}

/// Retune a live loop's white-balance warmth without restarting it. No-op if
/// nothing is running.
#[tauri::command]
pub fn set_ambient_warmth(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AmbientSync>,
    warmth: f64,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    if let Some(worker) = state.0.lock().unwrap().as_ref() {
        *worker.warmth.lock().unwrap() = warmth.clamp(0.0, WARMTH_MAX);
    }
    Ok(())
}

/// Retune a live loop's zone count without restarting it. No-op if nothing is
/// running.
#[tauri::command]
pub fn set_ambient_zones(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AmbientSync>,
    zones: usize,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    if let Some(worker) = state.0.lock().unwrap().as_ref() {
        worker
            .zones
            .store(zones.clamp(1, dx_light::MAX_ZONES), Ordering::Relaxed);
    }
    Ok(())
}

/// Retune a live loop's frame rate without restarting it. No-op if nothing is
/// running.
#[tauri::command]
pub fn set_ambient_fps(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AmbientSync>,
    fps: u32,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    if let Some(worker) = state.0.lock().unwrap().as_ref() {
        worker
            .fps
            .store(fps.clamp(MIN_FPS, MAX_FPS), Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub fn stop_ambient_sync(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AmbientSync>,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    stop(&state);
    Ok(())
}

/// Stop the loop and block until the worker thread has finished restoring the
/// strip. Safe to call when nothing is running.
pub(crate) fn stop(state: &AmbientSync) {
    let worker = state.0.lock().unwrap().take();
    if let Some(mut worker) = worker {
        worker.running.store(false, Ordering::Relaxed);
        if let Some(join) = worker.join.take() {
            let _ = join.join();
        }
    }
}

#[tauri::command]
pub fn ambient_sync_status(state: tauri::State<'_, AmbientSync>) -> bool {
    state.is_running()
}

/// The persisted screen-sync settings, used to seed the UI sliders on load.
#[tauri::command]
pub fn get_ambient_settings() -> AmbientSettings {
    current_settings()
}

/// Persist screen-sync settings. The UI calls this (debounced) as the sliders
/// move, so the tuning survives restarts. Independent of whether a loop is
/// running — the live `set_ambient_*` commands handle retuning an active loop.
#[tauri::command]
pub fn save_ambient_settings(
    window: tauri::WebviewWindow,
    settings: AmbientSettings,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    let settings = settings.sanitized();
    let mut guard = SETTINGS.lock().unwrap();
    *guard = settings;
    persist_settings(&guard);
    Ok(())
}
