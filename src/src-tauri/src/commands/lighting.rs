use serde::Serialize;

const MSI_VID: u16 = 0x0DB0;
const MSI_MYSTIC_LIGHT_PID: u16 = 0x0076;

const LOGITECH_VID: u16 = 0x046D;
const LOGITECH_PRO2_RECEIVER_PID: u16 = 0xC543;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HidDeviceInfo {
    pub vendor_id: u16,
    pub product_id: u16,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub usage_page: Option<u16>,
    pub usage: Option<u16>,
    pub interface_number: Option<i32>,
    pub path: String,
}

#[tauri::command]
pub fn list_hid_devices() -> Result<Vec<HidDeviceInfo>, String> {
    let api = hidapi::HidApi::new().map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for dev in api.device_list() {
        out.push(HidDeviceInfo {
            vendor_id: dev.vendor_id(),
            product_id: dev.product_id(),
            manufacturer: dev.manufacturer_string().map(|s| s.to_string()),
            product: dev.product_string().map(|s| s.to_string()),
            serial_number: dev.serial_number().map(|s| s.to_string()),
            usage_page: Some(dev.usage_page()),
            usage: Some(dev.usage()),
            interface_number: Some(dev.interface_number()),
            path: dev.path().to_string_lossy().into_owned(),
        });
    }

    // Keep it stable for UI diffing and logs.
    out.sort_by(|a, b| {
        (a.vendor_id, a.product_id, &a.path)
            .cmp(&(b.vendor_id, b.product_id, &b.path))
    });

    Ok(out)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleResult {
    pub attempted: bool,
    pub detail: String,
}

/// Vendor-native lighting on/off toggle (where implemented).
///
/// **Safety invariant:** this command only targets vendor-defined endpoints
/// and does not interfere with normal HID mouse/keyboard collections.
#[tauri::command]
pub fn set_vendor_lighting_enabled(vendor_id: u16, product_id: u16, enabled: bool) -> Result<ToggleResult, String> {
    if vendor_id == MSI_VID && product_id == MSI_MYSTIC_LIGHT_PID {
        set_msi_mystic_light_enabled(enabled)?;
        return Ok(ToggleResult {
            attempted: true,
            detail: if enabled {
                "MSI Mystic Light: sent direct-mode packets (white).".into()
            } else {
                "MSI Mystic Light: sent direct-mode packets (off).".into()
            },
        });
    }

    if vendor_id == LOGITECH_VID && product_id == LOGITECH_PRO2_RECEIVER_PID {
        return Ok(ToggleResult {
            attempted: false,
            detail: "Logitech receiver detected, but on/off is not implemented yet (HID++ framing needed).".into(),
        });
    }

    Ok(ToggleResult {
        attempted: false,
        detail: "No vendor-native toggle implemented for this device yet.".into(),
    })
}

fn set_msi_mystic_light_enabled(enabled: bool) -> Result<(), String> {
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

    let rgb = if enabled { (255, 255, 255) } else { (0, 0, 0) };

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

