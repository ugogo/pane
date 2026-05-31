import { invoke } from '@tauri-apps/api/core';

// ── Instrumentation ──────────────────────────────────────────────────────────

export interface ProcessMetrics {
  /** OS process ID — cross-reference with Task Manager. */
  pid: number;
  /** ms elapsed from Rust main() entry to this IPC call (includes WebView2 init). */
  startupElapsedMs: number;
  /** Physical RAM in the working set, bytes. */
  workingSetBytes: number;
  /** Physical RAM in the working set, MB (pre-divided). */
  workingSetMb: number;
  /** Virtual address space committed, bytes. */
  virtualMemoryBytes: number;
  /** Virtual address space committed, MB. */
  virtualMemoryMb: number;
}

export function getProcessMetrics() {
  return invoke<ProcessMetrics>('get_process_metrics');
}

// ── Core infrastructure ───────────────────────────────────────────────────────

export interface StartupResult {
  enabled: boolean;
  detail: string;
}

export function getRunAtStartup() {
  return invoke<boolean>('get_run_at_startup');
}

export function setRunAtStartup(enabled: boolean) {
  return invoke<StartupResult>('set_run_at_startup', { enabled });
}

// ── Capture ───────────────────────────────────────────────────────────────────

export interface CaptureResult {
  /** PNG, base64-encoded, ready for <img src>. */
  dataUrl: string;
  width: number;
  height: number;
}

export function captureFullscreen() {
  return invoke<CaptureResult>('capture_fullscreen');
}

export function captureRegion(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return invoke<CaptureResult>('capture_region', { x, y, width, height });
}

export function takeLatestCapture() {
  return invoke<CaptureResult | null>('take_latest_capture');
}

export function copyLatestCaptureToClipboard() {
  return invoke<void>('copy_latest_capture_to_clipboard');
}

export function saveLatestCaptureToDesktop() {
  return invoke<string>('save_latest_capture_to_desktop');
}

// ── Window helpers ────────────────────────────────────────────────────────────

export function showAreaSelector() {
  return invoke<void>('show_area_selector');
}

export function prepareCaptureWindows() {
  return invoke<void>('prepare_capture_windows');
}

export function showCapturePreview() {
  return invoke<void>('show_capture_preview');
}

export function previewReady() {
  return invoke<void>('preview_ready');
}

export function hideAreaSelector() {
  return invoke<void>('hide_area_selector');
}

export function hideCapturePreview() {
  return invoke<void>('hide_capture_preview');
}

export function areaSelectorOrigin() {
  return invoke<[number, number]>('area_selector_origin');
}

export function commitRegionCapture(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return invoke<void>('commit_region_capture', { x, y, width, height });
}

export function toggleCapturePreview() {
  return invoke<boolean>('toggle_capture_preview');
}

// ── Hotkeys ───────────────────────────────────────────────────────────────────

export type CaptureAction = 'fullscreen' | 'area';

export interface HotkeyResult {
  action: string;
  accelerator: string;
}

export interface CaptureHotkeys {
  fullscreen: string;
  area: string;
}

export function getCaptureHotkeys() {
  return invoke<CaptureHotkeys>('get_capture_hotkeys');
}

export function setCaptureHotkey(action: CaptureAction, accelerator: string) {
  return invoke<HotkeyResult>('set_capture_hotkey', { action, accelerator });
}

export function clearCaptureHotkey(action: CaptureAction) {
  return invoke<void>('clear_capture_hotkey', { action });
}

// ── Monitor controls (DDC/CI) ──────────────────────────────────────────────────

/** One adjustable DDC/CI control. `supported` is false when the monitor doesn't expose the VCP code. */
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
  brightness: Feature; // VCP 0x10
  contrast: Feature; // VCP 0x12
  redGain: Feature; // VCP 0x16 (white-balance red gain)
  greenGain: Feature; // VCP 0x18 (white-balance green gain)
  blueGain: Feature; // VCP 0x1A (white-balance blue gain)
}

/** Enumerate monitors and read each control once (seeds the cache). */
export function listMonitors() {
  return invoke<MonitorInfo[]>('list_monitors');
}

/** Re-enumerate after a monitor is plugged/unplugged. */
export function refreshMonitors() {
  return invoke<MonitorInfo[]>('refresh_monitors');
}

export function setMonitorBrightness(id: string, value: number) {
  return invoke<void>('set_monitor_brightness', { id, value });
}

export function setMonitorContrast(id: string, value: number) {
  return invoke<void>('set_monitor_contrast', { id, value });
}

export function setMonitorRedGain(id: string, value: number) {
  return invoke<void>('set_monitor_red_gain', { id, value });
}

export function setMonitorGreenGain(id: string, value: number) {
  return invoke<void>('set_monitor_green_gain', { id, value });
}

export function setMonitorBlueGain(id: string, value: number) {
  return invoke<void>('set_monitor_blue_gain', { id, value });
}

/** Step every brightness-capable monitor by `delta`; returns the new values. */
export function adjustAllBrightness(delta: number) {
  return invoke<MonitorInfo[]>('adjust_all_brightness', { delta });
}

/** A reusable monitor target, stored as percentages, plus a night-light flag. */
export interface MonitorPreset {
  name: string;
  brightnessPct: number;
  contrastPct: number;
  redGainPct: number;
  greenGainPct: number;
  blueGainPct: number;
}

export function getMonitorPresets() {
  return invoke<MonitorPreset[]>('get_monitor_presets');
}

/** Create or overwrite (by name) a preset; returns the updated list. */
export function saveMonitorPreset(preset: MonitorPreset) {
  return invoke<MonitorPreset[]>('save_monitor_preset', { preset });
}

export function deleteMonitorPreset(name: string) {
  return invoke<MonitorPreset[]>('delete_monitor_preset', { name });
}

/** Apply a preset to every capable monitor. */
export function applyMonitorPreset(name: string) {
  return invoke<MonitorInfo[]>('apply_monitor_preset', { name });
}

// ── MSI Mystic Light (motherboard ARGB headers) ───────────────────────────────

export interface MsiLightingPresence {
  present: boolean;
  vendorId: number;
  productId: number;
}

export function detectMsiLighting() {
  return invoke<MsiLightingPresence>('detect_msi_lighting');
}

export function applyMsiLighting(
  r: number,
  g: number,
  b: number,
  brightness: number,
) {
  return invoke<void>('apply_msi_lighting', { r, g, b, brightness });
}

// ── DX Light (Robobloq monitor bias strip) ────────────────────────────────────

export interface DxLightPresence {
  present: boolean;
  vendorId: number;
  productId: number;
}

export function detectDxLight() {
  return invoke<DxLightPresence>('detect_dx_light');
}

export function applyDxLight(
  r: number,
  g: number,
  b: number,
  brightness: number,
) {
  return invoke<void>('apply_dx_light', { r, g, b, brightness });
}

export function dxLightOff() {
  return invoke<void>('dx_light_off');
}

// ── Windows Dynamic Lighting (OS-managed) ──────────────────────────────────────

export interface DynamicLightingDevice {
  id: string;
  name: string;
}

export interface DynamicLightingStatus {
  canControl: boolean;
  hasPackageIdentity: boolean;
  reason: string | null;
}

export interface DynamicLightingApplyResult {
  detail: string;
}

export interface DynamicLightingDeviceInfo {
  isAvailable: boolean;
  isEnabled: boolean;
  isConnected: boolean;
  brightness: number;
  lampCount: number;
  kind: string;
  hardwareVendorId: number;
  hardwareProductId: number;
}

export function listDynamicLightingDevices() {
  return invoke<DynamicLightingDevice[]>('list_dynamic_lighting_devices');
}

export function getDynamicLightingStatus() {
  return invoke<DynamicLightingStatus>('get_dynamic_lighting_status');
}

export function getDynamicLightingInfo(deviceId: string) {
  return invoke<DynamicLightingDeviceInfo>('get_dynamic_lighting_info', {
    deviceId,
  });
}

export interface DynamicLightingLampInfo {
  index: number;
  purposes: string;
  fixedColor: string | null;
  nearestSupportedColorForWhite: string | null;
  redLevels: number;
  greenLevels: number;
  blueLevels: number;
  gainLevels: number;
}

export interface DynamicLightingDiagnostics {
  isAvailable: boolean;
  isEnabled: boolean;
  isConnected: boolean;
  brightness: number;
  lampCount: number;
  kind: string;
  hardwareVendorId: number;
  hardwareProductId: number;
  minUpdateIntervalMs: number;
  lamps: DynamicLightingLampInfo[];
}

export function applyDynamicLighting(
  deviceId: string,
  r: number,
  g: number,
  b: number,
  brightness: number,
) {
  return invoke<DynamicLightingApplyResult>('apply_dynamic_lighting', {
    deviceId,
    r,
    g,
    b,
    brightness,
  });
}

export function diagnoseDynamicLighting(deviceId: string) {
  return invoke<DynamicLightingDiagnostics>('diagnose_dynamic_lighting', {
    deviceId,
  });
}

export function turnAllLightsOffForSleep() {
  return invoke<[string, string | null][]>('turn_all_lights_off_for_sleep');
}

// ── Persisted per-light state ─────────────────────────────────────────────────

export interface LightState {
  r: number;
  g: number;
  b: number;
  brightness: number;
  /** False means the user explicitly turned the light off (last color preserved). */
  on: boolean;
}

/**
 * State keys:
 *  - "msi"                          → MSI Mystic Light
 *  - "dxlight"                      → DX Light strip
 *  - `dynamic:${deviceId}`          → a specific Dynamic Lighting LampArray
 */
export function getLightStates() {
  return invoke<Record<string, LightState>>('get_light_states');
}

/** Re-apply every persisted state. Returns per-light error messages (null = ok). */
export function restoreAllLights() {
  return invoke<Array<[string, string | null]>>('restore_all_lights');
}

// ── Sound ─────────────────────────────────────────────────────────────────────

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

export function listOutputDevices() {
  return invoke<AudioDevice[]>('list_output_devices');
}

export function listInputDevices() {
  return invoke<AudioDevice[]>('list_input_devices');
}

export function setDefaultOutputDevice(deviceId: string) {
  return invoke<void>('set_default_output_device', { deviceId });
}

export function setDefaultInputDevice(deviceId: string) {
  return invoke<void>('set_default_input_device', { deviceId });
}

export function getOutputVolume() {
  return invoke<VolumeInfo>('get_output_volume');
}

export function setOutputVolume(volume: number) {
  return invoke<void>('set_output_volume', { volume });
}

export function setOutputMute(muted: boolean) {
  return invoke<void>('set_output_mute', { muted });
}

export function getInputVolume() {
  return invoke<VolumeInfo>('get_input_volume');
}

export function setInputVolume(volume: number) {
  return invoke<void>('set_input_volume', { volume });
}

export function setInputMute(muted: boolean) {
  return invoke<void>('set_input_mute', { muted });
}

// ── Accent popup ──────────────────────────────────────────────────────────────

export function accentSelect(ch: string) {
  return invoke<void>('accent_select', { ch });
}

export function accentDismiss() {
  return invoke<void>('accent_dismiss');
}

export function getAccentPopupEnabled() {
  return invoke<boolean>('get_accent_popup_enabled');
}

export function setAccentPopupEnabled(enabled: boolean) {
  return invoke<void>('set_accent_popup_enabled', { enabled });
}
