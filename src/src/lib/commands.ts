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
