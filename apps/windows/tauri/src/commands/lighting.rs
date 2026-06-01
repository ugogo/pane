use serde::Serialize;

const MSI_VID: u16 = 0x0DB0;
const MSI_MYSTIC_LIGHT_PID: u16 = 0x0076;

// ── MSI Mystic Light — color + brightness ────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MsiLightingPresence {
    pub present: bool,
    pub vendor_id: u16,
    pub product_id: u16,
}

/// Quick probe — is the MSI Mystic Light HID endpoint reachable right now?
/// Returns `present=false` if HID enumeration succeeds but the device is
/// absent. Returns an `Err` only if hidapi itself fails to initialize.
#[tauri::command]
pub fn detect_msi_lighting() -> Result<MsiLightingPresence, String> {
    let api = hidapi::HidApi::new().map_err(|e| e.to_string())?;
    let present = api
        .device_list()
        .any(|d| d.vendor_id() == MSI_VID && d.product_id() == MSI_MYSTIC_LIGHT_PID);
    Ok(MsiLightingPresence {
        present,
        vendor_id: MSI_VID,
        product_id: MSI_MYSTIC_LIGHT_PID,
    })
}

/// Push a solid color to all MSI Mystic Light zones (motherboard ARGB headers).
/// Brightness is applied by pre-scaling the RGB values (MSI's direct-mode
/// firmware has no separate brightness register).
#[tauri::command]
pub fn apply_msi_lighting(
    window: tauri::WebviewWindow,
    r: u8,
    g: u8,
    b: u8,
    brightness: f64,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    apply_msi_lighting_inner(r, g, b, brightness)
}

/// Hardware write + state record, callable internally (e.g. wake-restore)
/// without a caller-window check.
pub(crate) fn apply_msi_lighting_inner(r: u8, g: u8, b: u8, brightness: f64) -> Result<(), String> {
    write_msi_lighting(r, g, b, brightness)?;
    // Treat brightness 0 as an explicit off so wake-restore matches intent.
    if brightness <= f64::EPSILON {
        crate::commands::light_state::record_off("msi");
    } else {
        crate::commands::light_state::record(
            "msi",
            crate::commands::light_state::LightState {
                r,
                g,
                b,
                brightness,
                on: true,
            },
        );
    }
    Ok(())
}

pub(crate) fn write_msi_lighting(r: u8, g: u8, b: u8, brightness: f64) -> Result<(), String> {
    let scale = brightness.clamp(0.0, 1.0);
    let scaled = (
        ((r as f64) * scale).round() as u8,
        ((g as f64) * scale).round() as u8,
        ((b as f64) * scale).round() as u8,
    );
    send_msi_mystic_light_packets(scaled)
}

fn send_msi_mystic_light_packets(rgb: (u8, u8, u8)) -> Result<(), String> {
    // Packet format mirrored from OpenRGB's MSI Mystic Light 761-byte controller.
    // (FeaturePacket_PerLED_761) — report_id 0x51, 240 LEDs, 720 RGB bytes.
    const REPORT_ID: u8 = 0x51;
    const FIXED1: u8 = 0x09;
    const LED_COUNT: u8 = 240;
    const COLORS_LEN: usize = 720;

    fn make_packet(hdr0: u8, hdr1: u8, rgb: (u8, u8, u8)) -> Vec<u8> {
        let mut buf = vec![0u8; 7 + COLORS_LEN];
        buf[0] = REPORT_ID;
        buf[1] = FIXED1;
        buf[2] = hdr0;
        buf[3] = hdr1;
        buf[4] = 0x00;
        buf[5] = 0x00;
        buf[6] = LED_COUNT;

        let (r, g, b) = rgb;
        for i in 0..240usize {
            let base = 7 + i * 3;
            buf[base] = r;
            buf[base + 1] = g;
            buf[base + 2] = b;
        }
        buf
    }

    let api = hidapi::HidApi::new().map_err(|e| e.to_string())?;
    let dev = api
        .device_list()
        .find(|d| d.vendor_id() == MSI_VID && d.product_id() == MSI_MYSTIC_LIGHT_PID)
        .ok_or_else(|| "MSI Mystic Light device not found (0DB0:0076).".to_string())?;

    let handle = api
        .open_path(dev.path())
        .map_err(|e| format!("Failed to open MSI Mystic Light HID path: {e}"))?;

    // Zones used by OpenRGB for PID 0x0076:
    // JAF: hdr0=0x08 hdr1=0x00
    // JARGB1: hdr0=0x04 hdr1=0x00
    // JARGB2: hdr0=0x04 hdr1=0x01
    // JARGB3: hdr0=0x04 hdr1=0x02
    let packets = [
        make_packet(0x08, 0x00, rgb),
        make_packet(0x04, 0x00, rgb),
        make_packet(0x04, 0x01, rgb),
        make_packet(0x04, 0x02, rgb),
    ];

    for p in packets {
        handle
            .send_feature_report(&p)
            .map_err(|e| format!("MSI feature report send failed: {e}"))?;
    }

    Ok(())
}
