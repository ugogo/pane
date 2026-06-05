// Canonical probe/result status shared across feature routes and their query
// helpers. Previously redeclared (as `ProbeStatus` / `Scan` / `Status`) in
// status-ui, lights-query, sound-query, display, capture, and lights — one type
// now covers all of them. The 4-state call sites simply never emit `disabled`.

export type Status = 'idle' | 'pass' | 'warn' | 'fail' | 'disabled';

/** A status paired with a human-readable message — the common card result shape. */
export interface StatusMessage {
  status: Status;
  message: string;
}
