// Wire types for the companion HTTP contract.
//
// These are hand-mirrored from the Rust serde structs (the source of truth) and
// must match them exactly — serde emits camelCase via `#[serde(rename_all =
// "camelCase")]`. Phase 3 of the monorepo plan replaces this file with
// generated types so the Rust structs are the only place these are declared.
//
// Rust origins:
//   - AudioDevice, VolumeInfo            → commands/audio.rs
//   - Feature, MonitorInfo, MonitorPreset → commands/brightness.rs (Preset)
//   - LightState                          → commands/light_state.rs
//   - LightSnapshot, CompanionSnapshot,
//     CompanionCommand                    → commands/companion_snapshot.rs
//   - HelloResponse, PairRequest,
//     PairResponse, CommandResponse       → commands/companion.rs

// ── Audio (commands/audio.rs) ────────────────────────────────────────────────

export interface AudioDevice {
  /** Opaque MMDevice endpoint ID, used to set the default. */
  id: string;
  name: string;
  isDefault: boolean;
}

export interface VolumeInfo {
  /** Scalar 0.0–1.0. */
  volume: number;
  muted: boolean;
}

// ── Monitors (commands/brightness.rs) ────────────────────────────────────────

/** One adjustable DDC/CI control. `supported` is false when the VCP code is absent. */
export interface Feature {
  value: number;
  /** Max VCP value for this monitor (often 100). */
  max: number;
  supported: boolean;
}

export interface MonitorInfo {
  /** Enumeration index as a string — stable within a session. */
  id: string;
  name: string;
  brightness: Feature;
  contrast: Feature;
  redGain: Feature;
  greenGain: Feature;
  blueGain: Feature;
}

/** A reusable monitor target, stored as percentages (Rust `Preset`). */
export interface MonitorPreset {
  name: string;
  brightnessPct: number;
  contrastPct: number;
  redGainPct: number;
  greenGainPct: number;
  blueGainPct: number;
}

// ── Lights (commands/light_state.rs, commands/companion_snapshot.rs) ──────────

export interface LightState {
  r: number;
  g: number;
  b: number;
  brightness: number;
  /** False means the user explicitly turned the light off (last color kept). */
  on: boolean;
}

export interface LightSnapshot {
  id: string;
  label: string;
  kind: string;
  state: LightState;
}

// ── Snapshot (GET /v1/snapshot) ──────────────────────────────────────────────

export interface CompanionSnapshot {
  brightnessPct: number;
  monitors: MonitorInfo[];
  presets: MonitorPreset[];
  lights: LightSnapshot[];
  outputDevices: AudioDevice[];
  inputDevices: AudioDevice[];
  outputVolume: VolumeInfo;
  inputVolume: VolumeInfo;
  accentPopupEnabled: boolean;
  runAtStartup: boolean;
}

// ── Hello (GET /v1/hello) ────────────────────────────────────────────────────

export interface HelloResponse {
  name: string;
  version: string;
}

// ── Pairing (POST /v1/pair) ──────────────────────────────────────────────────

export interface PairRequest {
  /** One-time token echoed from the QR pairing URI. */
  token: string;
  /** Display name shown in Pane's trusted-devices list. */
  name: string;
  /** base64-encoded ed25519 public key the device will sign with. */
  publicKey: string;
}

export interface PairResponse {
  deviceId: string;
  /** Bearer token presented on every subsequent signed request. */
  deviceToken: string;
}

// ── Commands (POST /v1/commands) ─────────────────────────────────────────────

/** Generic command response (`CommandResponse` in companion.rs). */
export interface CommandResponse {
  ok: boolean;
}

/**
 * The allowlisted command envelope. Mirrors the Rust `CompanionCommand` enum
 * (`#[serde(tag = "type", rename_all = "snake_case")]`): the variant tag is
 * snake_case, but struct fields keep their Rust names (already snake_case).
 */
export type CompanionCommand =
  | { type: 'set_brightness'; value: number }
  | { type: 'apply_monitor_preset'; name: string }
  | {
      type: 'set_light';
      light: string;
      r: number;
      g: number;
      b: number;
      brightness: number;
    }
  | { type: 'turn_light_off'; light: string }
  | { type: 'set_default_output_device'; device_id: string }
  | { type: 'set_default_input_device'; device_id: string }
  | { type: 'set_output_volume'; volume: number }
  | { type: 'set_output_mute'; muted: boolean }
  | { type: 'set_input_volume'; volume: number }
  | { type: 'set_input_mute'; muted: boolean }
  | { type: 'set_accent_popup_enabled'; enabled: boolean }
  | { type: 'set_run_at_startup'; enabled: boolean }
  | { type: 'sleep_computer' };
