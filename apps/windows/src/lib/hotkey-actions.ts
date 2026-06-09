import type { HotkeyAction } from './commands';

export interface HotkeyActionMeta {
  action: HotkeyAction;
  /** Short, sentence-case label shown next to the shortcut input. */
  label: string;
  /** One-line description of what triggering the action does. */
  description: string;
}

/**
 * Frontend registry of richer labels for each global hotkey action. The
 * authoritative action list lives in Rust (`HotkeyAction`); this mirror only
 * adds display metadata and intentionally keeps the same kebab-case ids.
 */
export const HOTKEY_ACTIONS: readonly HotkeyActionMeta[] = [
  {
    action: 'capture-fullscreen',
    label: 'Fullscreen capture',
    description: 'Capture the whole screen and open the preview.',
  },
  {
    action: 'capture-area',
    label: 'Area capture',
    description: 'Draw a region to capture.',
  },
  {
    action: 'toggle-capture-preview',
    label: 'Toggle capture preview',
    description: 'Show or hide the capture preview window.',
  },
] as const;

const META_BY_ACTION = new Map<HotkeyAction, HotkeyActionMeta>(
  HOTKEY_ACTIONS.map((meta) => [meta.action, meta]),
);

export function hotkeyActionMeta(action: HotkeyAction): HotkeyActionMeta {
  return (
    META_BY_ACTION.get(action) ?? {
      action,
      label: action,
      description: '',
    }
  );
}
