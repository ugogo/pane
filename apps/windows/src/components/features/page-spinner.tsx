import { Loader2 } from '@tamagui/lucide-icons';
import { YStack } from '@pane/ui';

export function PageSpinner() {
  return (
    <YStack items="center" justify="center" style={{ minHeight: 280 }}>
      <Loader2 aria-hidden color="$placeholderColor" size={20} />
    </YStack>
  );
}
