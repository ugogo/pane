import type { TamaguiBuildOptions } from 'tamagui';

export default {
  components: ['tamagui', '@pane/ui'],
  config: '../../packages/ui/tamagui.config.cjs',
  outputCSS: './app/tamagui.generated.css',
  disableExtraction: process.env.NODE_ENV === 'development',
} satisfies TamaguiBuildOptions;
