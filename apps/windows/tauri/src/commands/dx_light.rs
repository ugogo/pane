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

// Default LED strip length when we haven't read it back from the device.
// The legacy implementation uses this same fallback.
const DEFAULT_LAMPS: u8 = 60;

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

/// Single-section "all lamps = this color" payload.
fn section_payload(rgb: (u8, u8, u8), lamps: u8) -> Vec<u8> {
    let (r, g, b) = rgb;
    if lamps > 1 && lamps < 254 {
        // Two contiguous segments to cover the strip cleanly (mirrors the
        // legacy implementation's pattern for non-default lamp counts).
        vec![1, r, g, b, lamps, lamps + 1, r, g, b, 254]
    } else {
        vec![1, r, g, b, 254]
    }
}

/// Open the preferred (mi_00 / first matching) DX Light HID interface.
fn open_device(api: &HidApi) -> Result<hidapi::HidDevice, String> {
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
    let scale = brightness.clamp(0.0, 1.0);
    // Map 0..1 -> 5..255 so the device never receives below-minimum values
    // (firmware treats those as off).
    let brightness_byte = (MIN_BRIGHTNESS as f64
        + scale * (MAX_BRIGHTNESS as f64 - MIN_BRIGHTNESS as f64))
        .round()
        .clamp(MIN_BRIGHTNESS as f64, MAX_BRIGHTNESS as f64) as u8;

    let api = HidApi::new().map_err(|e| e.to_string())?;
    let handle = open_device(&api)?;

    let brightness_packet = build_packet(ACTION_SET_BRIGHTNESS, &[brightness_byte]);
    write_packet(&handle, &brightness_packet)?;

    let color_packet = build_packet(
        ACTION_SET_SECTION_LED,
        &section_payload((r, g, b), DEFAULT_LAMPS),
    );
    write_packet(&handle, &color_packet)?;

    Ok(())
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
