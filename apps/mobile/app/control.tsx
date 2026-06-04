import { Pressable, ScrollView, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { ControlSystemControls } from '../lib/control/control-system-controls';
import { SliderPanel } from '../lib/control/slider-panel';
import { controlStyles as styles } from '../lib/control/control.styles';
import { useControlScreen } from '../lib/control/use-control-screen';

export default function ControlScreen() {
  const {
    pairing,
    snapshot,
    brightness,
    setBrightness,
    outputVolume,
    setOutputVolume,
    lightLevels,
    setLightLevels,
    error,
    offline,
    displayName,
    statusLabel,
    statusColor,
    runCommand,
    runCommandNow,
    sleepComputer,
    unpair,
  } = useControlScreen();

  if (!pairing) return null;

  const muted = Boolean(snapshot?.outputVolume.muted);

  return (
    <Screen safeArea={false}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: statusColor }]}>
            {statusLabel}
          </Text>
          <Text style={styles.title}>{displayName}</Text>
        </View>

        <SliderPanel
          label="Brightness"
          valueText={`${brightness}%`}
          value={brightness}
          offline={offline}
          onValueChange={setBrightness}
          onChange={(value) => runCommand({ type: 'set_brightness', value })}
        />

        {snapshot && snapshot.presets.length > 0 ? (
          <View style={[styles.panel, offline && styles.panelOffline]}>
            <Text style={styles.label}>Monitor presets</Text>
            <View style={styles.chipRow}>
              {snapshot.presets.map((preset) => (
                <Pressable
                  key={preset.name}
                  disabled={offline}
                  style={styles.chip}
                  onPress={() =>
                    runCommandNow({
                      type: 'apply_monitor_preset',
                      name: preset.name,
                    })
                  }
                >
                  <Text style={styles.chipText}>{preset.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <SliderPanel
          label="Output volume"
          valueText={muted ? 'Muted' : `${outputVolume}%`}
          value={outputVolume}
          offline={offline}
          sliderDisabled={offline || muted}
          onValueChange={setOutputVolume}
          onChange={(value) =>
            runCommand({ type: 'set_output_volume', volume: value / 100 })
          }
          secondaryLabel={muted ? 'Unmute output' : 'Mute output'}
          onSecondary={() =>
            runCommandNow({ type: 'set_output_mute', muted: !muted })
          }
        />

        {snapshot?.lights.map((light) => {
          const lightLevel =
            lightLevels[light.id] ?? Math.round(light.state.brightness * 100);
          const hasLocalLevel = lightLevels[light.id] !== undefined;

          return (
            <SliderPanel
              key={light.id}
              label={light.label}
              valueText={
                light.state.on || hasLocalLevel ? `${lightLevel}%` : 'Off'
              }
              value={lightLevel}
              offline={offline}
              onValueChange={(value) =>
                setLightLevels((prev) => ({ ...prev, [light.id]: value }))
              }
              onChange={(value) => {
                setLightLevels((prev) => ({ ...prev, [light.id]: value }));
                runCommand({
                  type: 'set_light',
                  light: light.id,
                  r: light.state.r,
                  g: light.state.g,
                  b: light.state.b,
                  brightness: value / 100,
                });
              }}
              secondaryLabel="Turn off"
              onSecondary={() =>
                runCommandNow({ type: 'turn_light_off', light: light.id })
              }
            />
          );
        }) ?? null}

        {snapshot ? (
          <ControlSystemControls
            offline={offline}
            snapshot={snapshot}
            onCommand={runCommandNow}
            onSleep={sleepComputer}
          />
        ) : null}

        {offline ? (
          <Text style={styles.body}>
            Can&apos;t reach Pane. Make sure it&apos;s running on your desktop
            and on the same Wi-Fi. If your desktop IP changed, pair again.
          </Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.linkButton} onPress={unpair}>
          <Text style={styles.linkText}>Unpair this iPhone</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
