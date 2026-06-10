import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import { createInitialState, MOCK_GRADIENTS } from './data';
import { toast } from '../shared/toast';
import type {
  AmbientSync,
  CaptureShot,
  CompanionDevice,
  ID,
  KeyRemap,
  LightSource,
  Monitor,
  PaneState,
  SoundState,
} from './types';

// "Elm-ish" reducer: actions are pure updater functions. Keeps the action
// surface flexible without a giant tagged-union switch.
type Updater = (s: PaneState) => PaneState;
const reducer = (s: PaneState, fn: Updater): PaneState => fn(s);

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export interface PaneActions {
  // display
  setMonitor: (id: ID, patch: Partial<Monitor>) => void;
  setGain: (id: ID, ch: 'r' | 'g' | 'b', v: number) => void;
  applyDisplayPreset: (id: ID) => void;
  saveDisplayPreset: (name: string) => void;
  // sound
  setSound: (patch: Partial<SoundState>) => void;
  toggleMute: (kind: 'output' | 'input') => void;
  // lights
  setLight: (id: ID, patch: Partial<LightSource>) => void;
  toggleLight: (id: ID) => void;
  applyLightPreset: (id: ID) => void;
  setAmbient: (patch: Partial<AmbientSync>) => void;
  restoreLights: () => void;
  allLightsOff: () => void;
  // accents
  toggleAccents: () => void;
  setAccents: (patch: Partial<PaneState['accents']>) => void;
  // hotkeys
  setHotkeyChord: (id: ID, chord: string[]) => void;
  toggleHotkey: (id: ID) => void;
  addRemap: (from: string[], to: string[]) => void;
  updateRemap: (id: ID, patch: Partial<KeyRemap>) => void;
  removeRemap: (id: ID) => void;
  // companion
  pairCompanion: () => void;
  revokeCompanion: (id: ID) => void;
  // system
  toggleStartup: () => void;
  sleepNow: () => void;
  // capture
  addCapture: (mode: 'fullscreen' | 'area', region?: CaptureShot['region']) => CaptureShot;
  saveCapture: (id: ID) => string;
  deleteCapture: (id: ID) => void;
}

interface StoreValue {
  state: PaneState;
  actions: PaneActions;
}

const StoreCtx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  const actions = useMemo<PaneActions>(() => {
    const update = (fn: Updater) => dispatch(fn);

    return {
      setMonitor: (id, patch) =>
        update((s) => ({
          ...s,
          activeDisplayPresetId: null,
          monitors: s.monitors.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),

      setGain: (id, ch, v) =>
        update((s) => ({
          ...s,
          activeDisplayPresetId: null,
          monitors: s.monitors.map((m) =>
            m.id === id ? { ...m, gain: { ...m.gain, [ch]: clamp(v) } } : m,
          ),
        })),

      applyDisplayPreset: (id) =>
        update((s) => {
          const preset = s.displayPresets.find((p) => p.id === id);
          if (!preset) return s;
          const monitors = s.monitors.map((m) => {
            const ov = preset.values[m.id];
            return ov ? { ...m, ...ov, gain: ov.gain ? { ...m.gain, ...ov.gain } : m.gain } : m;
          });
          toast(`Display preset “${preset.name}” applied`, {
            tone: 'success',
            detail: `${Object.keys(preset.values).length} monitors`,
          });
          return { ...s, monitors, activeDisplayPresetId: id };
        }),

      saveDisplayPreset: (name) =>
        update((s) => {
          const values: PaneState['displayPresets'][number]['values'] = {};
          for (const m of s.monitors) {
            values[m.id] = { brightness: m.brightness, contrast: m.contrast, gain: { ...m.gain } };
          }
          const preset = { id: uid('dp'), name, description: 'Saved from current state', values };
          toast(`Saved display preset “${name}”`, { tone: 'success' });
          return { ...s, displayPresets: [...s.displayPresets, preset], activeDisplayPresetId: preset.id };
        }),

      setSound: (patch) => update((s) => ({ ...s, sound: { ...s.sound, ...patch } })),

      toggleMute: (kind) =>
        update((s) => {
          const key = kind === 'output' ? 'outputMuted' : 'inputMuted';
          const next = !s.sound[key];
          toast(`${kind === 'output' ? 'Output' : 'Input'} ${next ? 'muted' : 'unmuted'}`);
          return { ...s, sound: { ...s.sound, [key]: next } };
        }),

      setLight: (id, patch) =>
        update((s) => ({
          ...s,
          activeLightPresetId: patch.effect || patch.color || patch.brightness ? null : s.activeLightPresetId,
          lights: s.lights.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),

      toggleLight: (id) =>
        update((s) => ({
          ...s,
          lights: s.lights.map((l) => (l.id === id ? { ...l, on: !l.on } : l)),
        })),

      applyLightPreset: (id) =>
        update((s) => {
          const preset = s.lightPresets.find((p) => p.id === id);
          if (!preset) return s;
          toast(`Light preset “${preset.name}” applied`, { tone: 'success' });
          return {
            ...s,
            activeLightPresetId: id,
            lights: s.lights.map((l) =>
              l.connected
                ? { ...l, color: preset.color, brightness: preset.brightness, effect: preset.effect, on: true }
                : l,
            ),
          };
        }),

      setAmbient: (patch) => update((s) => ({ ...s, ambient: { ...s.ambient, ...patch } })),

      restoreLights: () =>
        update((s) => {
          toast('Lights restored', { tone: 'success', detail: 'Aurora · screen-sync re-enabled' });
          return {
            ...s,
            lights: s.lights.map((l) => (l.connected ? { ...l, on: true } : l)),
            ambient: { ...s.ambient, enabled: true },
          };
        }),

      allLightsOff: () =>
        update((s) => {
          toast('All lights off');
          return {
            ...s,
            lights: s.lights.map((l) => ({ ...l, on: false })),
            ambient: { ...s.ambient, enabled: false },
          };
        }),

      toggleAccents: () =>
        update((s) => {
          const next = !s.accents.enabled;
          toast(`Accents ${next ? 'enabled' : 'disabled'}`);
          return { ...s, accents: { ...s.accents, enabled: next } };
        }),

      setAccents: (patch) => update((s) => ({ ...s, accents: { ...s.accents, ...patch } })),

      setHotkeyChord: (id, chord) =>
        update((s) => ({
          ...s,
          hotkeys: s.hotkeys.map((h) => (h.id === id ? { ...h, chord } : h)),
        })),

      toggleHotkey: (id) =>
        update((s) => ({
          ...s,
          hotkeys: s.hotkeys.map((h) => (h.id === id ? { ...h, enabled: !h.enabled } : h)),
        })),

      addRemap: (from, to) =>
        update((s) => ({
          ...s,
          remaps: [...s.remaps, { id: uid('rm'), from, to, enabled: true }],
        })),

      updateRemap: (id, patch) =>
        update((s) => ({
          ...s,
          remaps: s.remaps.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      removeRemap: (id) =>
        update((s) => ({ ...s, remaps: s.remaps.filter((r) => r.id !== id) })),

      pairCompanion: () =>
        update((s) => {
          const dev: CompanionDevice = {
            id: uid('dev'),
            name: 'New iPhone',
            model: 'iPhone16,1 · iOS 18.4',
            pairedAt: new Date().toISOString(),
            lastSeen: 'just now',
            online: true,
          };
          toast('Companion paired', { tone: 'success', detail: dev.name });
          return { ...s, companions: [dev, ...s.companions] };
        }),

      revokeCompanion: (id) =>
        update((s) => {
          const dev = s.companions.find((d) => d.id === id);
          if (dev) toast(`Revoked ${dev.name}`, { tone: 'warn' });
          return { ...s, companions: s.companions.filter((d) => d.id !== id) };
        }),

      toggleStartup: () =>
        update((s) => {
          const next = !s.system.runAtStartup;
          toast(`Run at startup ${next ? 'on' : 'off'}`);
          return { ...s, system: { ...s.system, runAtStartup: next } };
        }),

      sleepNow: () => {
        toast('Sleeping…', { tone: 'warn', detail: 'System would suspend now' });
      },

      addCapture: (mode, region) => {
        const grad = MOCK_GRADIENTS[Math.floor(Math.random() * MOCK_GRADIENTS.length)];
        const shot: CaptureShot = {
          id: uid('cap'),
          mode,
          region,
          createdAt: new Date().toISOString(),
          gradient: grad,
        };
        update((s) => ({ ...s, captures: [shot, ...s.captures].slice(0, 12) }));
        return shot;
      },

      saveCapture: (id) => {
        const path = `C:\\Users\\ugo\\Desktop\\Pane ${new Date().toISOString().slice(0, 10)} ${id.slice(-4)}.png`;
        update((s) => ({
          ...s,
          captures: s.captures.map((c) => (c.id === id ? { ...c, savedPath: path } : c)),
        }));
        toast('Saved to desktop', { tone: 'success', detail: path });
        return path;
      },

      deleteCapture: (id) =>
        update((s) => ({ ...s, captures: s.captures.filter((c) => c.id !== id) })),
    };
  }, []);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

export function usePane(): PaneState {
  return useStore().state;
}

export function useActions(): PaneActions {
  return useStore().actions;
}
