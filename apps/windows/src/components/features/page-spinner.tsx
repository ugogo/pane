import { Loader2Icon } from 'lucide-react';
import { YStack } from '@pane/ui';

export function PageSpinner() {
  return (
    <YStack
      alignItems="center"
      justifyContent="center"
      style={{ minHeight: 280 }}
    >
      <Loader2Icon aria-hidden size={20} />
    </YStack>
  );
}
