import { defaultConfig } from '@tamagui/config/v5';
import { createTamagui } from 'tamagui';

import { colors } from './tokens';

const paneTheme = {
  ...defaultConfig.themes.dark,
  background: colors.background,
  backgroundHover: colors.card,
  backgroundPress: colors.muted,
  backgroundFocus: colors.card,
  color: colors.foreground,
  colorHover: colors.foreground,
  colorPress: colors.foreground,
  colorFocus: colors.foreground,
  borderColor: colors.border,
  borderColorHover: colors.border,
  placeholderColor: colors.mutedForeground,
  input: colors.input,
  colorTransparent: 'transparent',
  blue1: colors.card,
  blue2: colors.secondary,
  blue3: colors.muted,
  blue4: colors.mutedForeground,
  blue5: colors.foreground,
  blue6: colors.primary,
  blue7: colors.primary,
  blue8: colors.primary,
  blue9: colors.accent,
  blue10: colors.accent,
  blue11: colors.accentForeground,
  blue12: colors.foreground,
  gray1: colors.background,
  gray2: colors.card,
  gray3: colors.secondary,
  gray4: colors.muted,
  gray5: colors.mutedForeground,
  gray6: colors.mutedForeground,
  gray7: colors.foreground,
  gray8: colors.foreground,
  gray9: colors.primary,
  gray10: colors.primaryForeground,
  gray11: colors.foreground,
  gray12: colors.foreground,
  red1: colors.destructive,
  red9: colors.destructive,
  red10: colors.destructive,
  red11: colors.destructive,
  green4: 'rgba(61, 82, 76, 0.22)',
  green9: colors.accent,
  green10: colors.accent,
  green11: colors.accentForeground,
  statusPass: colors.statusPass,
  statusPassBg: colors.statusPassBg,
  statusWarn: colors.statusWarn,
  statusFailBg: colors.statusFailBg,
  errorSurface: colors.errorSurface,
  errorBorder: colors.errorBorder,
  sliderTrack: colors.input,
  white: colors.white,
  black: colors.black,
};

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  themes: {
    ...defaultConfig.themes,
    pane: paneTheme,
    pane_dark: paneTheme,
  },
});

export type UITamaguiConfig = typeof tamaguiConfig;

export default tamaguiConfig;

declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends UITamaguiConfig {}
}

declare module '@tamagui/core' {
  interface Theme {
    statusPass: string;
    statusPassBg: string;
    statusWarn: string;
    statusFailBg: string;
    errorSurface: string;
    errorBorder: string;
    sliderTrack: string;
  }
}
