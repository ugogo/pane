const { defaultConfig } = require('@tamagui/config/v5');
const { animations: paneAnimations } = require('@tamagui/config/v5-css');
const { createTamagui } = require('tamagui');

const { colors } = require('./tokens.cjs');

const appTheme = {
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
  green4: colors.accentSubtle,
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

const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations: paneAnimations,
  settings: {
    ...defaultConfig.settings,
    onlyAllowShorthands: false,
  },
  themes: {
    ...defaultConfig.themes,
    dark: appTheme,
  },
});

module.exports = tamaguiConfig;
