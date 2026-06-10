// Domain types for the Pane mock data layer.
// These mirror the real app's feature areas but are entirely fake / local.

export type ID = string;

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export interface Monitor {
  id: ID;
  name: string;
  model: string;
  primary: boolean;
  resolution: string;
  refreshHz: number;
  ddc: boolean; // supports DDC/CI
  brightness: number; // 0..100
  contrast: number; // 0..100
  gain: { r: number; g: number; b: number }; // 0..100 each
}

export interface DisplayPreset {
  id: ID;
  name: string;
  description: string;
  // partial per-monitor overrides keyed by monitor id
  values: Record<ID, Partial<Pick<Monitor, 'brightness' | 'contrast' | 'gain'>>>;
}

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

export interface AudioDevice {
  id: ID;
  name: string;
  kind: 'output' | 'input';
  isDefault: boolean;
}

export interface SoundState {
  outputDeviceId: ID;
  inputDeviceId: ID;
  outputVolume: number; // 0..100
  inputVolume: number; // 0..100
  outputMuted: boolean;
  inputMuted: boolean;
  devices: AudioDevice[];
}

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------

export type LightKind = 'motherboard' | 'bias' | 'dynamic';

export interface LightSource {
  id: ID;
  name: string;
  vendor: string;
  kind: LightKind;
  ledCount: number;
  on: boolean;
  brightness: number; // 0..100
  color: string; // hex, current solid color
  effect: 'solid' | 'breathe' | 'rainbow' | 'screen-sync';
  connected: boolean;
}

export interface AmbientSync {
  enabled: boolean;
  brightness: number; // 0..100
  saturation: number; // 0..100
  warmth: number; // 0..100 (cool -> warm)
  zones: number; // edge sampling zones
  fps: number; // capture frames per second
  sourceMonitorId: ID;
}

export interface LightPreset {
  id: ID;
  name: string;
  color: string;
  brightness: number;
  effect: LightSource['effect'];
}

// ---------------------------------------------------------------------------
// Accents (long-press diacritics)
// ---------------------------------------------------------------------------

export interface AccentsState {
  enabled: boolean;
  holdMs: number; // long-press threshold
  // base key -> ordered variant glyphs
  map: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Hotkeys / Shortcuts
// ---------------------------------------------------------------------------

export type ActionId =
  | 'capture.fullscreen'
  | 'capture.area'
  | 'preview.toggle'
  | 'app.show'
  | 'system.sleep'
  | 'lights.restore'
  | 'lights.off'
  | 'accents.toggle'
  | 'palette.open';

export interface Hotkey {
  id: ID;
  actionId: ActionId;
  label: string;
  chord: string[]; // e.g. ['Ctrl','Shift','3']
  enabled: boolean;
}

export interface KeyRemap {
  id: ID;
  from: string[]; // source chord
  to: string[]; // sent chord
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Companion devices
// ---------------------------------------------------------------------------

export interface CompanionDevice {
  id: ID;
  name: string;
  model: string;
  pairedAt: string; // ISO
  lastSeen: string; // human label
  online: boolean;
}

// ---------------------------------------------------------------------------
// System / Diagnostics
// ---------------------------------------------------------------------------

export interface SystemState {
  runAtStartup: boolean;
}

export interface Diagnostics {
  workingSetMB: number;
  peakWorkingSetMB: number;
  startupMs: number;
  pid: number;
  uptimeSec: number;
  cpuPercent: number;
  version: string;
}

// ---------------------------------------------------------------------------
// Capture flow
// ---------------------------------------------------------------------------

export interface CaptureShot {
  id: ID;
  mode: 'fullscreen' | 'area';
  region?: { x: number; y: number; w: number; h: number };
  createdAt: string;
  gradient: [string, string, string]; // mock image stops
  savedPath?: string;
}

// ---------------------------------------------------------------------------
// Root state
// ---------------------------------------------------------------------------

export interface PaneState {
  monitors: Monitor[];
  displayPresets: DisplayPreset[];
  activeDisplayPresetId: ID | null;
  sound: SoundState;
  lights: LightSource[];
  ambient: AmbientSync;
  lightPresets: LightPreset[];
  activeLightPresetId: ID | null;
  accents: AccentsState;
  hotkeys: Hotkey[];
  remaps: KeyRemap[];
  companions: CompanionDevice[];
  system: SystemState;
  diagnostics: Diagnostics;
  captures: CaptureShot[];
}
