import { Loader2 } from '@pane/ui';
import { YStack } from '@pane/ui';

export function PageSpinner() {
  return (
    <YStack
      alignItems="center"
      justifyContent="center"
      style={{ minHeight: 280 }}
    >
      <Loader2 aria-hidden color="$placeholderColor" size={20} />
    </YStack>
  );
}
