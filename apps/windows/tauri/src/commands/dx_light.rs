//! DX Light (Robobloq) RGB strip — bias lighting attached behind a monitor.
//!
//! Protocol reverse-engineered from the legacy WinUI app's `DXLight.Core`
//! (`RobobloqProtocol.cs`, `HidDeviceTransport.cs`).
//!
//! USB IDs:
//!   VID 0x1A86 — WCH (CH9102 USB-Serial bridge that Robobloq use as HID)
//!   PID 0xFE07 — DX Light HID-bridged variant (we don't support the 0xFE0C
//!                serial variant on Windows v1)
//!
//! Packet layout: `[0x52, 0x42, total_len, msg_id, action, ...payload, checksum]`
//! where `checksum = (sum of all preceding bytes) mod 256`.
//!
//! On Windows, the device exposes multiple HID interfaces; only `mi_00`
//! accepts protocol writes. We pick the first matching VID/PID entry whose
//! device path contains "mi_00" (case-insensitive), falling back to the
//! first match otherwise.

use std::sync::atomic::{AtomicU8, Ordering};

use hidapi::HidApi;
use serde::Serialize;

const VID: u16 = 0x1A86;
const PID: u16 = 0xFE07;

// Robobloq action bytes (subset — only what we need for v1).
const ACTION_SET_SECTION_LED: u8 = 134;
const ACTION_SET_BRIGHTNESS: u8 = 135;
const ACTION_TURN_OFF_LIGHT: u8 = 151;

const MIN_BRIGHTNESS: u8 = 5;
const MAX_BRIGHTNESS: u8 = 255;

const HEADER_LO: u8 = 0x52;
const HEADER_HI: u8 = 0x42;

// Logical lamp addressing space the firmware exposes, independent of the
// physical LED count. Sections are addressed within [SECTION_FIRST, SECTION_LAST].
const SECTION_FIRST: u32 = 1;
const SECTION_LAST: u32 = 254;

// A `SetSectionLed` payload is 5 bytes per segment (`[start, r, g, b, end]`),
// and `write_packet` caps a packet at 64 bytes (5 header + payload + 1
// checksum), leaving 58 payload bytes → at most 11 segments. Stay under that.
pub(crate) const MAX_ZONES: usize = 10;

// Monotonic 1..=254 message id, wrapping. Matches the legacy stamp behavior
// so any future request/response correlation logic doesn't accidentally
// collide with 0x00 (often reserved) or 0xFF (often sentinel).
static MESSAGE_ID: AtomicU8 = AtomicU8::new(0);

fn next_message_id() -> u8 {
    loop {
        let prev = MESSAGE_ID.load(Ordering::Relaxed);
        let next = if prev >= 254 { 1 } else { prev + 1 };
        if MESSAGE_ID
            .compare_exchange(prev, next, Ordering::Relaxed, Ordering::Relaxed)
            .is_ok()
        {
            return next;
        }
    }
}

fn checksum(bytes: &[u8]) -> u8 {
    (bytes.iter().map(|b| *b as u32).sum::<u32>() % 256) as u8
}

fn build_packet(action: u8, payload: &[u8]) -> Vec<u8> {
    let total_len = (6 + payload.len()) as u8;
    let mut bytes = Vec::with_capacity(total_len as usize);
    bytes.push(HEADER_LO);
    bytes.push(HEADER_HI);
    bytes.push(total_len);
    bytes.push(next_message_id());
    bytes.push(action);
    bytes.extend_from_slice(payload);
    bytes.push(checksum(&bytes));
    bytes
}

/// Build a `SetSectionLed` payload that splits the logical lamp range evenly
/// into one contiguous segment per color, in order (color 0 → first lamps).
/// A single color collapses to the whole-strip segment `[1, r, g, b, 254]`.
fn zones_payload(colors: &[(u8, u8, u8)]) -> Vec<u8> {
    let n = colors.len().clamp(1, MAX_ZONES) as u32;
    let span = SECTION_LAST - SECTION_FIRST + 1;
    let mut payload = Vec::with_capacity(n as usize * 5);
    for (i, &(r, g, b)) in colors.iter().take(n as usize).enumerate() {
        let i = i as u32;
        let start = SECTION_FIRST + span * i / n;
        let end = SECTION_FIRST + span * (i + 1) / n - 1;
        payload.push(start as u8);
        payload.push(r);
        payload.push(g);
        payload.push(b);
        payload.push(end as u8);
    }
    payload
}

/// Open the preferred (mi_00 / first matching) DX Light HID interface.
///
/// `pub(crate)` so the ambient-sync loop can open the strip once and keep the
/// handle alive for the duration of the loop instead of re-enumerating HID on
/// every frame. Note: the returned handle is only valid while the `HidApi`
/// passed in stays alive, so callers must keep `api` in scope.
pub(crate) fn open_device(api: &HidApi) -> Result<hidapi::HidDevice, String> {
    let mut candidate: Option<&hidapi::DeviceInfo> = None;
    let mut preferred: Option<&hidapi::DeviceInfo> = None;
    for d in api.device_list() {
        if d.vendor_id() == VID && d.product_id() == PID {
            if candidate.is_none() {
                candidate = Some(d);
            }
            let path = d.path().to_string_lossy().to_ascii_lowercase();
            if path.contains("mi_00") {
                preferred = Some(d);
                break;
            }
        }
    }
    let dev = preferred
        .or(candidate)
        .ok_or_else(|| format!("DX Light strip not found ({:04X}:{:04X}).", VID, PID))?;
    api.open_path(dev.path())
        .map_err(|e| format!("Failed to open DX Light HID path: {e}"))
}

/// Write a protocol packet as HID OUTPUT reports (not feature reports).
/// hidapi's `write` prepends report id 0x00 when the first byte is 0, so we
/// pre-pend it explicitly and let hidapi pass the buffer through unchanged.
fn write_packet(handle: &hidapi::HidDevice, packet: &[u8]) -> Result<(), String> {
    // Most Robobloq packets fit comfortably under 64 bytes (their max
    // section payload is ~16 bytes). We pad to 65 (report id + 64) which is
    // the standard HID full-speed interrupt-out report size.
    const REPORT_SIZE: usize = 65;
    let mut buf = vec![0u8; REPORT_SIZE];
    if packet.len() > REPORT_SIZE - 1 {
        return Err(format!(
            "DX Light packet too large for HID report ({} > {} bytes).",
            packet.len(),
            REPORT_SIZE - 1
        ));
    }
    buf[1..1 + packet.len()].copy_from_slice(packet);
    handle
        .write(&buf)
        .map_err(|e| format!("DX Light write failed: {e}"))?;
    // Per legacy transport, give the device ~2ms to settle between writes.
    std::thread::sleep(std::time::Duration::from_millis(2));
    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DxLightPresence {
    pub present: bool,
    pub vendor_id: u16,
    pub product_id: u16,
}

#[tauri::command]
pub fn detect_dx_light() -> Result<DxLightPresence, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let present = api
        .device_list()
        .any(|d| d.vendor_id() == VID && d.product_id() == PID);
    Ok(DxLightPresence {
        present,
        vendor_id: VID,
        product_id: PID,
    })
}

/// Push a solid color at the requested brightness to the entire strip.
/// Brightness is sent as a separate `SetBrightness` packet (Robobloq has a
/// real brightness register), then color goes via `SetSectionLed`.
#[tauri::command]
pub fn apply_dx_light(
    window: tauri::WebviewWindow,
    r: u8,
    g: u8,
    b: u8,
    brightness: f64,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    apply_dx_light_inner(r, g, b, brightness)
}

/// Hardware write + state record, callable internally (e.g. wake-restore)
/// without a caller-window check.
pub(crate) fn apply_dx_light_inner(r: u8, g: u8, b: u8, brightness: f64) -> Result<(), String> {
    write_dx_light(r, g, b, brightness)?;
    crate::commands::light_state::record(
        "dxlight",
        crate::commands::light_state::LightState {
            r,
            g,
            b,
            brightness,
            on: true,
        },
    );

    Ok(())
}

pub(crate) fn write_dx_light(r: u8, g: u8, b: u8, brightness: f64) -> Result<(), String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let handle = open_device(&api)?;
    write_color(&handle, r, g, b, brightness)
}

/// Push a solid color + brightness to an already-open strip handle.
///
/// Split out from [`write_dx_light`] so the ambient-sync loop can write every
/// frame without paying for `HidApi::new()` + device enumeration each time.
pub(crate) fn write_color(
    handle: &hidapi::HidDevice,
    r: u8,
    g: u8,
    b: u8,
    brightness: f64,
) -> Result<(), String> {
    write_brightness(handle, brightness)?;
    write_zones(handle, &[(r, g, b)])
}

/// Set just the brightness register on an already-open handle. The ambient loop
/// keeps this separate from the color write so it can resend brightness only
/// when the slider actually moves, halving HID traffic at high frame rates.
pub(crate) fn write_brightness(handle: &hidapi::HidDevice, brightness: f64) -> Result<(), String> {
    let scale = brightness.clamp(0.0, 1.0);
    // Map 0..1 -> 5..255 so the device never receives below-minimum values
    // (firmware treats those as off).
    let brightness_byte = (MIN_BRIGHTNESS as f64
        + scale * (MAX_BRIGHTNESS as f64 - MIN_BRIGHTNESS as f64))
        .round()
        .clamp(MIN_BRIGHTNESS as f64, MAX_BRIGHTNESS as f64) as u8;
    let packet = build_packet(ACTION_SET_BRIGHTNESS, &[brightness_byte]);
    write_packet(handle, &packet)
}

/// Paint the strip with one segment per color (left → right), in a single
/// `SetSectionLed` packet. One color fills the whole strip.
pub(crate) fn write_zones(
    handle: &hidapi::HidDevice,
    colors: &[(u8, u8, u8)],
) -> Result<(), String> {
    let packet = build_packet(ACTION_SET_SECTION_LED, &zones_payload(colors));
    write_packet(handle, &packet)
}

#[tauri::command]
pub fn dx_light_off(window: tauri::WebviewWindow) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    dx_light_off_inner()
}

pub(crate) fn dx_light_off_inner() -> Result<(), String> {
    write_dx_light_off()?;
    crate::commands::light_state::record_off("dxlight");
    Ok(())
}

pub(crate) fn write_dx_light_off() -> Result<(), String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;
    let handle = open_device(&api)?;
    let packet = build_packet(ACTION_TURN_OFF_LIGHT, &[]);
    write_packet(&handle, &packet)?;
    Ok(())
}
