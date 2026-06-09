import type { TamaguiBuildOptions } from 'tamagui';

// Extraction is disabled everywhere: the optimizing compiler can't load the
// Tamagui config under React 19 (@tamagui/react-native-web-lite imports the
// removed react-dom `unmountComponentAtNode`), so production extraction emits an
// empty stylesheet. Tamagui v1 injects component + theme CSS at runtime instead
// — the same path the dev server uses.
export default {
  components: ['tamagui', '@pane/ui'],
  config: '../../packages/ui/tamagui.config.cjs',
  disableExtraction: true,
} satisfies TamaguiBuildOptions;
