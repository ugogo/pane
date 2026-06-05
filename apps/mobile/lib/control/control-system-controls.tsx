import type { CompanionCommand, CompanionSnapshot } from '@pane/protocol';
import { Button, Card, Label, Switch, Text, XStack } from '@pane/ui';

export function ControlSystemControls({
  offline,
  snapshot,
  onCommand,
  onSleep,
}: {
  offline: boolean;
  snapshot: CompanionSnapshot;
  onCommand: (body: CompanionCommand) => void;
  onSleep: () => void;
}) {
  return (
    <Card offline={offline} gap="$4">
      <XStack alignItems="center" justifyContent="space-between">
        <Label>Accent popup</Label>
        <Switch
          {...(offline ? { disabled: true } : {})}
          value={snapshot.accentPopupEnabled}
          onValueChange={(enabled: boolean) =>
            onCommand({ type: 'set_accent_popup_enabled', enabled })
          }
        />
      </XStack>
      <XStack alignItems="center" justifyContent="space-between">
        <Label>Run at startup</Label>
        <Switch
          {...(offline ? { disabled: true } : {})}
          value={snapshot.runAtStartup}
          onValueChange={(enabled: boolean) =>
            onCommand({ type: 'set_run_at_startup', enabled })
          }
        />
      </XStack>
      <Button
        disabled={offline}
        btnScale="sm"
        appearance="secondary"
        onPress={onSleep}
      >
        <Text>Sleep computer</Text>
      </Button>
    </Card>
  );
}
