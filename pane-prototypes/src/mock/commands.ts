import type { PaneActions } from './store';
import type { PaneState } from './types';

// Stable identifiers for the feature areas every prototype exposes.
// Each prototype maps these to its own routes.
export type AreaKey =
  | 'capture'
  | 'display'
  | 'sound'
  | 'lights'
  | 'accents'
  | 'hotkeys'
  | 'system'
  | 'companion'
  | 'diagnostics';

export interface CommandContext {
  state: PaneState;
  actions: PaneActions;
  goto: (area: AreaKey) => void;
  startCapture: (mode: 'fullscreen' | 'area') => void;
}

export interface Command {
  id: string;
  title: string;
  subtitle?: string;
  group: 'Capture' | 'Display' | 'Sound' | 'Lights' | 'Accents' | 'System' | 'Navigate';
  /** monospace metadata shown on the right (shortcut, value, path) */
  meta?: string;
  keywords?: string;
  run: () => void;
}

export function buildCommands(ctx: CommandContext): Command[] {
  const { state, actions, goto, startCapture } = ctx;
  const cmds: Command[] = [];

  // Capture
  cmds.push(
    {
      id: 'cap.full',
      title: 'Capture fullscreen',
      subtitle: 'Grab every pixel on the primary display',
      group: 'Capture',
      meta: 'Ctrl⇧3',
      keywords: 'screenshot screen grab print',
      run: () => startCapture('fullscreen'),
    },
    {
      id: 'cap.area',
      title: 'Capture area',
      subtitle: 'Drag to select a region',
      group: 'Capture',
      meta: 'Ctrl⇧4',
      keywords: 'screenshot region selection snip',
      run: () => startCapture('area'),
    },
  );

  // Display presets
  for (const p of state.displayPresets) {
    cmds.push({
      id: `disp.${p.id}`,
      title: `Display: ${p.name}`,
      subtitle: p.description,
      group: 'Display',
      meta: 'preset',
      keywords: 'monitor brightness contrast gain ddc',
      run: () => actions.applyDisplayPreset(p.id),
    });
  }

  // Sound — volume presets + mute
  for (const v of [0, 25, 50, 75]) {
    cmds.push({
      id: `vol.${v}`,
      title: `Set output volume ${v}%`,
      group: 'Sound',
      meta: `${v}%`,
      keywords: 'audio loud quiet sound',
      run: () => actions.setSound({ outputVolume: v, outputMuted: false }),
    });
  }
  cmds.push({
    id: 'sound.mute',
    title: state.sound.outputMuted ? 'Unmute output' : 'Mute output',
    group: 'Sound',
    meta: state.sound.outputMuted ? 'muted' : 'live',
    keywords: 'audio silence',
    run: () => actions.toggleMute('output'),
  });

  // Lights
  for (const p of state.lightPresets) {
    cmds.push({
      id: `light.${p.id}`,
      title: `Lights: ${p.name}`,
      subtitle: `${p.effect} · ${p.brightness}%`,
      group: 'Lights',
      meta: p.color,
      keywords: 'rgb argb mystic bias ambient color',
      run: () => actions.applyLightPreset(p.id),
    });
  }
  cmds.push(
    {
      id: 'light.restore',
      title: 'Restore lights',
      subtitle: 'Re-enable sources and screen-sync',
      group: 'Lights',
      meta: 'restore',
      keywords: 'rgb on revert',
      run: () => actions.restoreLights(),
    },
    {
      id: 'light.off',
      title: 'All lights off',
      group: 'Lights',
      meta: 'blackout',
      keywords: 'rgb dark disable',
      run: () => actions.allLightsOff(),
    },
  );

  // Accents
  cmds.push({
    id: 'accents.toggle',
    title: state.accents.enabled ? 'Disable accents helper' : 'Enable accents helper',
    subtitle: 'Long-press for diacritics (à â ä …)',
    group: 'Accents',
    meta: state.accents.enabled ? 'on' : 'off',
    keywords: 'diacritics accent typing keyboard',
    run: () => actions.toggleAccents(),
  });

  // System
  cmds.push(
    {
      id: 'sys.sleep',
      title: 'Sleep now',
      group: 'System',
      meta: 'suspend',
      keywords: 'power off suspend',
      run: () => actions.sleepNow(),
    },
    {
      id: 'sys.startup',
      title: state.system.runAtStartup ? 'Disable run at startup' : 'Enable run at startup',
      group: 'System',
      meta: state.system.runAtStartup ? 'on' : 'off',
      keywords: 'launch boot login',
      run: () => actions.toggleStartup(),
    },
  );

  // Navigation
  const areas: { area: AreaKey; title: string }[] = [
    { area: 'capture', title: 'Capture' },
    { area: 'display', title: 'Display' },
    { area: 'sound', title: 'Sound' },
    { area: 'lights', title: 'Lights' },
    { area: 'accents', title: 'Accents' },
    { area: 'hotkeys', title: 'Hotkeys' },
    { area: 'system', title: 'System' },
    { area: 'companion', title: 'Companion' },
    { area: 'diagnostics', title: 'Diagnostics' },
  ];
  for (const a of areas) {
    cmds.push({
      id: `nav.${a.area}`,
      title: `Go to ${a.title}`,
      group: 'Navigate',
      meta: 'page',
      keywords: 'open jump navigate',
      run: () => goto(a.area),
    });
  }

  return cmds;
}
