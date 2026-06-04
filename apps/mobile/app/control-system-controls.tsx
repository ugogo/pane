import { Pressable, Switch, Text, View } from 'react-native';
import type { CompanionCommand, CompanionSnapshot } from '@pane/protocol';
import { controlStyles as styles } from './control.styles';

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
    <View style={[styles.panel, offline && styles.panelOffline]}>
      <View style={styles.rowBetween}>
        <Text style={styles.label}>Accent popup</Text>
        <Switch
          disabled={offline}
          value={snapshot.accentPopupEnabled}
          onValueChange={(enabled) =>
            onCommand({ type: 'set_accent_popup_enabled', enabled })
          }
        />
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.label}>Run at startup</Text>
        <Switch
          disabled={offline}
          value={snapshot.runAtStartup}
          onValueChange={(enabled) =>
            onCommand({ type: 'set_run_at_startup', enabled })
          }
        />
      </View>
      <Pressable
        disabled={offline}
        style={styles.secondaryButton}
        onPress={onSleep}
      >
        <Text style={styles.secondaryButtonText}>Sleep computer</Text>
      </Pressable>
    </View>
  );
}
