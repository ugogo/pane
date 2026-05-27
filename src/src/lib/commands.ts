import { invoke } from "@tauri-apps/api/core";

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
  return invoke<ProcessMetrics>("get_process_metrics");
}

// ── Core infrastructure ───────────────────────────────────────────────────────

export interface StartupResult {
  enabled: boolean;
  detail: string;
}

export function getRunAtStartup() {
  return invoke<boolean>("get_run_at_startup");
}

export function setRunAtStartup(enabled: boolean) {
  return invoke<StartupResult>("set_run_at_startup", { enabled });
}

// ── Capture ───────────────────────────────────────────────────────────────────

export interface CaptureResult {
  /** PNG, base64-encoded, ready for <img src>. */
  dataUrl: string;
  width: number;
  height: number;
}

export function captureFullscreen() {
  return invoke<CaptureResult>("capture_fullscreen");
}

export function captureRegion(x: number, y: number, width: number, height: number) {
  return invoke<CaptureResult>("capture_region", { x, y, width, height });
}

export function takeLatestCapture() {
  return invoke<CaptureResult | null>("take_latest_capture");
}

export function copyLatestCaptureToClipboard() {
  return invoke<void>("copy_latest_capture_to_clipboard");
}

export function saveLatestCaptureToDesktop() {
  return invoke<string>("save_latest_capture_to_desktop");
}

// ── Window helpers ────────────────────────────────────────────────────────────

export function showAreaSelector() {
  return invoke<void>("show_area_selector");
}

export function prepareCaptureWindows() {
  return invoke<void>("prepare_capture_windows");
}

export function showCapturePreview(width: number, height: number) {
  return invoke<void>("show_capture_preview", { width, height });
}

export function previewReady() {
  return invoke<void>("preview_ready");
}

export function closeAreaSelector() {
  return invoke<void>("close_area_selector");
}

export function hideAreaSelector() {
  return invoke<void>("hide_area_selector");
}

export function hideCapturePreview() {
  return invoke<void>("hide_capture_preview");
}

export function areaSelectorOrigin() {
  return invoke<[number, number]>("area_selector_origin");
}

export function commitRegionCapture(x: number, y: number, width: number, height: number) {
  return invoke<void>("commit_region_capture", { x, y, width, height });
}

export function toggleCapturePreview() {
  return invoke<boolean>("toggle_capture_preview");
}

// ── Hotkeys ───────────────────────────────────────────────────────────────────

export type CaptureAction = "fullscreen" | "area";

export interface HotkeyResult {
  action: string;
  accelerator: string;
}

export interface CaptureHotkeys {
  fullscreen: string;
  area: string;
}

export function getCaptureHotkeys() {
  return invoke<CaptureHotkeys>("get_capture_hotkeys");
}

export function setCaptureHotkey(action: CaptureAction, accelerator: string) {
  return invoke<HotkeyResult>("set_capture_hotkey", { action, accelerator });
}

export function clearCaptureHotkey(action: CaptureAction) {
  return invoke<void>("clear_capture_hotkey", { action });
}

// ── Lighting (vendor-native probes) ────────────────────────────────────────────

export interface HidDeviceInfo {
  vendorId: number;
  productId: number;
  manufacturer: string | null;
  product: string | null;
  serialNumber: string | null;
  usagePage: number | null;
  usage: number | null;
  interfaceNumber: number | null;
  path: string;
}

export function listHidDevices() {
  return invoke<HidDeviceInfo[]>("list_hid_devices");
}

export interface ToggleResult {
  attempted: boolean;
  detail: string;
}

export function setVendorLightingEnabled(vendorId: number, productId: number, enabled: boolean) {
  return invoke<ToggleResult>("set_vendor_lighting_enabled", { vendorId, productId, enabled });
}

// ── MSI Mystic Light (motherboard ARGB headers) ───────────────────────────────

export interface MsiLightingPresence {
  present: boolean;
  vendorId: number;
  productId: number;
}

export function detectMsiLighting() {
  return invoke<MsiLightingPresence>("detect_msi_lighting");
}

export function applyMsiLighting(r: number, g: number, b: number, brightness: number) {
  return invoke<void>("apply_msi_lighting", { r, g, b, brightness });
}

// ── DX Light (Robobloq monitor bias strip) ────────────────────────────────────

export interface DxLightPresence {
  present: boolean;
  vendorId: number;
  productId: number;
}

export function detectDxLight() {
  return invoke<DxLightPresence>("detect_dx_light");
}

export function applyDxLight(r: number, g: number, b: number, brightness: number) {
  return invoke<void>("apply_dx_light", { r, g, b, brightness });
}

export function dxLightOff() {
  return invoke<void>("dx_light_off");
}

// ── Windows Dynamic Lighting (OS-managed) ──────────────────────────────────────

export interface DynamicLightingDevice {
  id: string;
  name: string;
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
  return invoke<DynamicLightingDevice[]>("list_dynamic_lighting_devices");
}

export function getDynamicLightingInfo(deviceId: string) {
  return invoke<DynamicLightingDeviceInfo>("get_dynamic_lighting_info", { deviceId });
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

export function applyDynamicLighting(deviceId: string, r: number, g: number, b: number, brightness: number) {
  return invoke<DynamicLightingApplyResult>("apply_dynamic_lighting", {
    deviceId,
    r,
    g,
    b,
    brightness,
  });
}

export function diagnoseDynamicLighting(deviceId: string) {
  return invoke<DynamicLightingDiagnostics>("diagnose_dynamic_lighting", { deviceId });
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
  return invoke<Record<string, LightState>>("get_light_states");
}

/** Re-apply every persisted state. Returns per-light error messages (null = ok). */
export function restoreAllLights() {
  return invoke<Array<[string, string | null]>>("restore_all_lights");
}
