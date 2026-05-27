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

// ── Window helpers ────────────────────────────────────────────────────────────

export function showAreaSelector() {
  return invoke<void>("show_area_selector");
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

export function setCaptureHotkey(action: CaptureAction, accelerator: string) {
  return invoke<HotkeyResult>("set_capture_hotkey", { action, accelerator });
}

export function clearCaptureHotkey(action: CaptureAction) {
  return invoke<void>("clear_capture_hotkey", { action });
}
