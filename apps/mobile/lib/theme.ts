// Named color tokens for the companion. Replaces the hex literals that were
// duplicated across the screens, styles, and the Slider. Dark-only (the
// companion has no light theme).

export const colors = {
  background: '#0b0b0c',
  surface: '#161618',
  surfaceBorder: '#262629',
  elevated: '#2a2a2e',
  textPrimary: '#fafafa',
  textMuted: '#a3a3a3',
  accent: '#5ed6a8',
  onAccent: '#0b0b0c',
  danger: '#f87171',
  white: '#ffffff',
  cameraBackground: '#000000',
  cameraOverlay: 'rgba(0,0,0,0.55)',
} as const;

/** Connection-state accents for the control screen status line. */
export const statusColors = {
  connecting: colors.textMuted,
  offline: colors.danger,
  connected: colors.accent,
} as const;
