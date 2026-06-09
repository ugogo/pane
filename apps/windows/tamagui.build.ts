import type { TamaguiBuildOptions } from 'tamagui';

// Extraction (the optimizing compiler) is disabled everywhere: under React 19,
// loading the Tamagui config for extraction crashes inside
// @tamagui/react-native-web-lite (`unmountComponentAtNode` no longer exists),
// so production builds used to emit an empty tamagui.generated.css and ship an
// unstyled app. Runtime CSS injection — the same path dev already uses — styles
// the app instead. The committed tamagui.generated.css is still imported as a
// no-FOUC baseline; with no `outputCSS` here, the build never overwrites it.
export default {
  components: ['tamagui', '@pane/ui'],
  config: '../../packages/ui/tamagui.config.cjs',
  disableExtraction: true,
} satisfies TamaguiBuildOptions;
