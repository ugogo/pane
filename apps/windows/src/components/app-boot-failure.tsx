import { useEffect } from 'react';
import { AlertTriangle } from '@pane/ui';
import { Card, MutedText, Text, colors, XStack, YStack } from '@pane/ui';
import { revealMainWindow } from '@/lib/reveal-main-window';

export function AppBootFailure({
  title = "Couldn't start Pane",
  message,
}: {
  title?: string;
  message: string;
}) {
  useEffect(() => {
    void revealMainWindow().catch(console.error);
  }, []);

  return (
    <YStack
      flex={1}
      backgroundColor="$background"
      alignItems="center"
      justifyContent="center"
      padding="$6"
    >
      <Card
        gap="$3"
        padding="$4"
        width="100%"
        style={{
          maxWidth: 480,
          backgroundColor: colors.errorSurface,
          borderColor: colors.errorBorder,
        }}
      >
        <XStack gap="$2" alignItems="flex-start">
          <AlertTriangle aria-hidden color="$red11" size={18} />
          <YStack flex={1} gap="$2">
            <Text color="$red11" fontSize="$5" fontWeight="600">
              {title}
            </Text>
            <Text color="$red11" fontSize="$3">
              {message}
            </Text>
            <MutedText fontSize="$2">
              Close Pane from the window controls or system tray, then try
              again.
            </MutedText>
          </YStack>
        </XStack>
      </Card>
    </YStack>
  );
}
