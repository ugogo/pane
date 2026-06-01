//! Companion snapshot + command dispatch (slice 7).
//!
//! Builds a transport-neutral settings snapshot for `GET /v1/snapshot` and
//! applies allowlisted `CompanionCommand` variants by calling the same
//! window-free service entry points as Tauri IPC.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;

use super::{
    audio::{self, AudioDevice, VolumeInfo},
    brightness::{self, MonitorInfo, Preset},
    light_state::{self, LightState},
    lighting, startup,
};
use crate::commands::{dx_light, dynamic_lighting};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LightSnapshot {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub state: LightState,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionSnapshot {
    pub brightness_pct: u8,
    pub monitors: Vec<MonitorInfo>,
    pub presets: Vec<Preset>,
    pub lights: Vec<LightSnapshot>,
    pub output_devices: Vec<AudioDevice>,
    pub input_devices: Vec<AudioDevice>,
    pub output_volume: VolumeInfo,
    pub input_volume: VolumeInfo,
    pub accent_popup_enabled: bool,
    pub run_at_startup: bool,
}

pub struct CompanionContext {
    pub config_dir: PathBuf,
    pub app: AppHandle,
}

fn presets_path(config_dir: &Path) -> PathBuf {
    config_dir.join("monitor-presets.json")
}

pub fn build_snapshot(ctx: &CompanionContext) -> CompanionSnapshot {
    let monitors = brightness::list_monitors_snapshot();
    let brightness_pct = brightness::average_brightness_pct(&monitors);
    let presets = brightness::load_presets_at(&presets_path(&ctx.config_dir));
    let lights = build_light_snapshot();
    let (output_devices, input_devices, output_volume, input_volume) = audio_snapshot();
    let accent_popup_enabled = crate::accent_popup::is_enabled();
    let run_at_startup = startup::get_run_at_startup().unwrap_or(false);

    CompanionSnapshot {
        brightness_pct,
        monitors,
        presets,
        lights,
        output_devices,
        input_devices,
        output_volume,
        input_volume,
        accent_popup_enabled,
        run_at_startup,
    }
}

fn audio_snapshot() -> (Vec<AudioDevice>, Vec<AudioDevice>, VolumeInfo, VolumeInfo) {
    let empty_volume = VolumeInfo {
        volume: 0.0,
        muted: false,
    };
    let output_devices = audio::companion_list_output_devices().unwrap_or_default();
    let input_devices = audio::companion_list_input_devices().unwrap_or_default();
    let output_volume = audio::companion_get_output_volume().unwrap_or(empty_volume.clone());
    let input_volume = audio::companion_get_input_volume().unwrap_or(empty_volume);
    (output_devices, input_devices, output_volume, input_volume)
}

fn build_light_snapshot() -> Vec<LightSnapshot> {
    let persisted = light_state::snapshot();
    let mut out = Vec::new();

    if lighting::detect_msi_lighting()
        .map(|p| p.present)
        .unwrap_or(false)
    {
        out.push(LightSnapshot {
            id: "msi".to_string(),
            label: "MSI motherboard".to_string(),
            kind: "msi".to_string(),
            state: persisted.get("msi").cloned().unwrap_or_default(),
        });
    }

    if dx_light::detect_dx_light()
        .map(|p| p.present)
        .unwrap_or(false)
    {
        out.push(LightSnapshot {
            id: "dxlight".to_string(),
            label: "DX Light strip".to_string(),
            kind: "dxlight".to_string(),
            state: persisted.get("dxlight").cloned().unwrap_or_default(),
        });
    }

    if let Ok(devices) =
        tauri::async_runtime::block_on(dynamic_lighting::list_dynamic_lighting_devices())
    {
        for device in devices {
            let id = format!("dynamic:{}", device.id);
            out.push(LightSnapshot {
                label: device.name,
                kind: "dynamic".to_string(),
                state: persisted.get(&id).cloned().unwrap_or_default(),
                id,
            });
        }
    }

    out
}

/// Allowlisted companion commands (slice 7). Serialized with `"type": "snake_case"`.
#[derive(Debug, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CompanionCommand {
    SetBrightness {
        value: u8,
    },
    ApplyMonitorPreset {
        name: String,
    },
    SetLight {
        light: String,
        r: u8,
        g: u8,
        b: u8,
        brightness: f64,
    },
    TurnLightOff {
        light: String,
    },
    SetDefaultOutputDevice {
        device_id: String,
    },
    SetDefaultInputDevice {
        device_id: String,
    },
    SetOutputVolume {
        volume: f64,
    },
    SetOutputMute {
        muted: bool,
    },
    SetInputVolume {
        volume: f64,
    },
    SetInputMute {
        muted: bool,
    },
    SetAccentPopupEnabled {
        enabled: bool,
    },
    SetRunAtStartup {
        enabled: bool,
    },
}

pub fn run_command(ctx: &CompanionContext, command: CompanionCommand) -> Result<(), String> {
    match command {
        CompanionCommand::SetBrightness { value } => {
            brightness::set_all_brightness_pct(value.min(100));
            Ok(())
        }
        CompanionCommand::ApplyMonitorPreset { name } => {
            brightness::apply_preset_at(&presets_path(&ctx.config_dir), &name)?;
            Ok(())
        }
        CompanionCommand::SetLight {
            light,
            r,
            g,
            b,
            brightness,
        } => apply_light(&light, r, g, b, brightness),
        CompanionCommand::TurnLightOff { light } => turn_light_off(&light),
        CompanionCommand::SetDefaultOutputDevice { device_id } => {
            audio::companion_set_default_output(&device_id)
        }
        CompanionCommand::SetDefaultInputDevice { device_id } => {
            audio::companion_set_default_input(&device_id)
        }
        CompanionCommand::SetOutputVolume { volume } => audio::companion_set_output_volume(volume),
        CompanionCommand::SetOutputMute { muted } => audio::companion_set_output_mute(muted),
        CompanionCommand::SetInputVolume { volume } => audio::companion_set_input_volume(volume),
        CompanionCommand::SetInputMute { muted } => audio::companion_set_input_mute(muted),
        CompanionCommand::SetAccentPopupEnabled { enabled } => {
            crate::accent_popup::set_enabled(&ctx.app, enabled);
            Ok(())
        }
        CompanionCommand::SetRunAtStartup { enabled } => {
            startup::set_run_at_startup_enabled(enabled)
        }
    }
}

fn apply_light(light: &str, r: u8, g: u8, b: u8, brightness: f64) -> Result<(), String> {
    if light == "msi" {
        return lighting::apply_msi_lighting_inner(r, g, b, brightness);
    }
    if light == "dxlight" {
        return dx_light::apply_dx_light_inner(r, g, b, brightness);
    }
    if let Some(device_id) = light.strip_prefix("dynamic:") {
        return tauri::async_runtime::block_on(dynamic_lighting::apply_dynamic_lighting_persist(
            device_id.to_string(),
            r,
            g,
            b,
            brightness,
        ))
        .map(|_| ());
    }
    Err(format!("unknown light '{light}'"))
}

fn turn_light_off(light: &str) -> Result<(), String> {
    if light == "msi" {
        return lighting::apply_msi_lighting_inner(0, 0, 0, 0.0);
    }
    if light == "dxlight" {
        return dx_light::dx_light_off_inner();
    }
    if let Some(device_id) = light.strip_prefix("dynamic:") {
        return tauri::async_runtime::block_on(dynamic_lighting::apply_dynamic_lighting_persist(
            device_id.to_string(),
            0,
            0,
            0,
            0.0,
        ))
        .map(|_| ());
    }
    Err(format!("unknown light '{light}'"))
}
