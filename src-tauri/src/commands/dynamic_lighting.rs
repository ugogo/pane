use serde::Serialize;
use windows::core::HSTRING;
use windows::Devices::Enumeration::DeviceInformation;
use windows::Devices::Lights::Effects::{LampArrayEffectPlaylist, LampArraySolidEffect};
use windows::Devices::Lights::LampArray;
use windows::Devices::Lights::LampPurposes;
use windows::Foundation::TimeSpan;
use windows::UI::Color;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicLightingDevice {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicLightingApplyResult {
    pub detail: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicLightingDeviceInfo {
    pub is_available: bool,
    pub is_enabled: bool,
    pub is_connected: bool,
    pub brightness: f64,
    pub lamp_count: i32,
    pub kind: String,
    pub hardware_vendor_id: u16,
    pub hardware_product_id: u16,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicLightingLampInfo {
    pub index: i32,
    pub purposes: String,
    pub fixed_color: Option<String>,
    pub nearest_supported_color_for_white: Option<String>,
    pub red_levels: i32,
    pub green_levels: i32,
    pub blue_levels: i32,
    pub gain_levels: i32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicLightingDiagnostics {
    pub is_available: bool,
    pub is_enabled: bool,
    pub is_connected: bool,
    pub brightness: f64,
    pub lamp_count: i32,
    pub kind: String,
    pub hardware_vendor_id: u16,
    pub hardware_product_id: u16,
    pub min_update_interval_ms: i64,
    pub lamps: Vec<DynamicLightingLampInfo>,
}

fn fmt_rgb(c: Color) -> String {
    format!("rgb({}, {}, {})", c.R, c.G, c.B)
}

fn fmt_purposes(p: LampPurposes) -> String {
    // LampPurposes is a flag enum; format!("{:?}") is pretty noisy, so we
    // build a stable string ourselves.
    let mut out: Vec<&'static str> = Vec::new();
    if p.contains(LampPurposes::Illumination) {
        out.push("Illumination");
    }
    if p.contains(LampPurposes::Branding) {
        out.push("Branding");
    }
    if p.contains(LampPurposes::Accent) {
        out.push("Accent");
    }
    if p.contains(LampPurposes::Status) {
        out.push("Status");
    }
    if out.is_empty() {
        "None".to_string()
    } else {
        out.join("|")
    }
}

#[tauri::command]
pub async fn list_dynamic_lighting_devices() -> Result<Vec<DynamicLightingDevice>, String> {
    let selector = LampArray::GetDeviceSelector().map_err(|e| e.to_string())?;
    let selector = HSTRING::from(selector);
    let devices = DeviceInformation::FindAllAsyncAqsFilter(&selector)
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for dev in devices {
        let id = dev.Id().map_err(|e| e.to_string())?.to_string();
        let name = dev.Name().map_err(|e| e.to_string())?.to_string();
        out.push(DynamicLightingDevice { id, name });
    }

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub async fn get_dynamic_lighting_info(
    device_id: String,
) -> Result<DynamicLightingDeviceInfo, String> {
    let device_id = HSTRING::from(device_id);
    let lamp_array = LampArray::FromIdAsync(&device_id)
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;

    let is_available = lamp_array.IsAvailable().map_err(|e| e.to_string())?;
    let is_enabled = lamp_array.IsEnabled().map_err(|e| e.to_string())?;
    let is_connected = lamp_array.IsConnected().map_err(|e| e.to_string())?;
    let brightness = lamp_array.BrightnessLevel().map_err(|e| e.to_string())?;
    let lamp_count = lamp_array.LampCount().map_err(|e| e.to_string())?;
    let kind = format!(
        "{:?}",
        lamp_array.LampArrayKind().map_err(|e| e.to_string())?
    );
    let hardware_vendor_id = lamp_array.HardwareVendorId().map_err(|e| e.to_string())?;
    let hardware_product_id = lamp_array.HardwareProductId().map_err(|e| e.to_string())?;

    Ok(DynamicLightingDeviceInfo {
        is_available,
        is_enabled,
        is_connected,
        brightness,
        lamp_count,
        kind,
        hardware_vendor_id,
        hardware_product_id,
    })
}

#[tauri::command]
pub async fn diagnose_dynamic_lighting(
    device_id: String,
) -> Result<DynamicLightingDiagnostics, String> {
    let device_id = HSTRING::from(device_id);
    let lamp_array = LampArray::FromIdAsync(&device_id)
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;

    let is_available = lamp_array.IsAvailable().map_err(|e| e.to_string())?;
    let is_enabled = lamp_array.IsEnabled().map_err(|e| e.to_string())?;
    let is_connected = lamp_array.IsConnected().map_err(|e| e.to_string())?;
    let brightness = lamp_array.BrightnessLevel().map_err(|e| e.to_string())?;
    let lamp_count = lamp_array.LampCount().map_err(|e| e.to_string())?;
    let kind = format!(
        "{:?}",
        lamp_array.LampArrayKind().map_err(|e| e.to_string())?
    );
    let hardware_vendor_id = lamp_array.HardwareVendorId().map_err(|e| e.to_string())?;
    let hardware_product_id = lamp_array.HardwareProductId().map_err(|e| e.to_string())?;
    let min_update_interval = lamp_array.MinUpdateInterval().map_err(|e| e.to_string())?;
    let min_update_interval_ms = std::time::Duration::from(min_update_interval).as_millis() as i64;

    let mut lamps = Vec::new();
    let white = Color {
        A: 255,
        R: 255,
        G: 255,
        B: 255,
    };

    for i in 0..lamp_count {
        let info = lamp_array.GetLampInfo(i).map_err(|e| e.to_string())?;
        let purposes = info.Purposes().map_err(|e| e.to_string())?;
        let fixed_color = match info.FixedColor() {
            Ok(reference) => reference.Value().map(fmt_rgb).ok(),
            Err(_) => None,
        };
        let nearest_supported_color_for_white = info
            .GetNearestSupportedColor(white)
            .map(|c| fmt_rgb(c))
            .ok();

        lamps.push(DynamicLightingLampInfo {
            index: i,
            purposes: fmt_purposes(purposes),
            fixed_color,
            nearest_supported_color_for_white,
            red_levels: info.RedLevelCount().map_err(|e| e.to_string())?,
            green_levels: info.GreenLevelCount().map_err(|e| e.to_string())?,
            blue_levels: info.BlueLevelCount().map_err(|e| e.to_string())?,
            gain_levels: info.GainLevelCount().map_err(|e| e.to_string())?,
        });
    }

    Ok(DynamicLightingDiagnostics {
        is_available,
        is_enabled,
        is_connected,
        brightness,
        lamp_count,
        kind,
        hardware_vendor_id,
        hardware_product_id,
        min_update_interval_ms,
        lamps,
    })
}

#[tauri::command]
pub async fn apply_dynamic_lighting(
    device_id: String,
    r: u8,
    g: u8,
    b: u8,
    brightness: f64,
) -> Result<DynamicLightingApplyResult, String> {
    apply_dynamic_lighting_inner(device_id, r, g, b, brightness, true).await
}

pub(crate) async fn write_dynamic_lighting(
    device_id: String,
    r: u8,
    g: u8,
    b: u8,
    brightness: f64,
) -> Result<DynamicLightingApplyResult, String> {
    apply_dynamic_lighting_inner(device_id, r, g, b, brightness, false).await
}

async fn apply_dynamic_lighting_inner(
    device_id: String,
    r: u8,
    g: u8,
    b: u8,
    brightness: f64,
    persist: bool,
) -> Result<DynamicLightingApplyResult, String> {
    let device_key = format!("dynamic:{device_id}");
    let device_id = HSTRING::from(device_id);
    let lamp_array = LampArray::FromIdAsync(&device_id)
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;

    if !lamp_array.IsEnabled().map_err(|e| e.to_string())? {
        let _ = lamp_array.SetIsEnabled(true);
    }

    let brightness = brightness.clamp(0.0, 1.0);
    let lamp_count = lamp_array.LampCount().map_err(|e| e.to_string())?;
    let _ = lamp_array.SetBrightnessLevel(brightness);
    let color = Color {
        A: 255,
        R: r,
        G: g,
        B: b,
    };

    let indices: Vec<i32> = if lamp_count > 0 {
        (0..lamp_count).collect()
    } else {
        vec![]
    };

    // Hold the color indefinitely — the effect runs until the app exits or
    // another playlist takes over. i64::MAX ticks ≈ 29,000 years.
    let duration = TimeSpan { Duration: i64::MAX };

    // Try every available path and record which (if any) yielded errors. We do
    // NOT short-circuit on IsAvailable=false because the OS sometimes grants
    // control transiently during the call, and the actual error code is more
    // informative than a pre-flight check.
    let mut steps: Vec<String> = Vec::new();

    let effect_res = LampArraySolidEffect::CreateInstance(&lamp_array, &indices);
    match effect_res {
        Ok(effect) => {
            if let Err(e) = effect.SetColor(color) {
                steps.push(format!("effect.SetColor err: {e}"));
            }
            if let Err(e) = effect.SetDuration(duration) {
                steps.push(format!("effect.SetDuration err: {e}"));
            }
            match LampArrayEffectPlaylist::new() {
                Ok(playlist) => {
                    if let Err(e) = playlist.Append(&effect) {
                        steps.push(format!("playlist.Append err: {e}"));
                    }
                    match playlist.Start() {
                        Ok(_) => steps.push("playlist.Start ok".to_string()),
                        Err(e) => {
                            steps.push(format!("playlist.Start err: {e} ({:#x})", e.code().0))
                        }
                    }
                }
                Err(e) => steps.push(format!("Playlist::new err: {e}")),
            }
        }
        Err(e) => steps.push(format!("SolidEffect::CreateInstance err: {e}")),
    }

    match lamp_array.SetColor(color) {
        Ok(_) => steps.push("SetColor ok".to_string()),
        Err(e) => steps.push(format!("SetColor err: {e} ({:#x})", e.code().0)),
    }

    let purposes = LampPurposes::Illumination
        | LampPurposes::Branding
        | LampPurposes::Accent
        | LampPurposes::Status;
    match lamp_array.SetColorsForPurposes(color, purposes) {
        Ok(_) => steps.push("SetColorsForPurposes ok".to_string()),
        Err(e) => steps.push(format!("SetColorsForPurposes err: {e} ({:#x})", e.code().0)),
    }

    let is_available_after = lamp_array.IsAvailable().map_err(|e| e.to_string())?;

    if persist {
        if brightness <= f64::EPSILON {
            crate::commands::light_state::record_off(&device_key);
        } else {
            crate::commands::light_state::record(
                &device_key,
                crate::commands::light_state::LightState {
                    r,
                    g,
                    b,
                    brightness,
                    on: true,
                },
            );
        }
    }

    let had_errors = steps.iter().any(|s| s.contains("err:"));
    let detail = if had_errors {
        format!(
            "rgb({},{},{}) at {:.0}% — some steps failed: {}",
            r,
            g,
            b,
            brightness * 100.0,
            steps.iter().filter(|s| s.contains("err:")).cloned().collect::<Vec<_>>().join("; ")
        )
    } else {
        format!("rgb({},{},{}) at {:.0}%.", r, g, b, brightness * 100.0)
    };

    // Retain availability context only when something went wrong so the
    // diagnostic is useful without drowning normal applies in noise.
    let detail = if had_errors {
        format!(
            "{} (available={}, connected={}, lamps={})",
            detail,
            is_available_after,
            lamp_array.IsConnected().map_err(|e| e.to_string())?,
            lamp_count,
        )
    } else {
        detail
    };

    Ok(DynamicLightingApplyResult { detail })
}
