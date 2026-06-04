import { Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Slider } from '../components/Slider';
import { ControlSystemControls } from '../lib/control/control-system-controls';
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

  return (
    <View style={styles.shell}>
      <StatusBar style="light" />
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

        <View style={[styles.panel, offline && styles.panelOffline]}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Brightness</Text>
            <Text style={styles.value}>{brightness}%</Text>
          </View>
          <Slider
            value={brightness}
            onValueChange={setBrightness}
            onChange={(value) => runCommand({ type: 'set_brightness', value })}
            disabled={offline}
          />
        </View>

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

        <View style={[styles.panel, offline && styles.panelOffline]}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Output volume</Text>
            <Text style={styles.value}>
              {snapshot?.outputVolume.muted ? 'Muted' : `${outputVolume}%`}
            </Text>
          </View>
          <Slider
            value={outputVolume}
            onValueChange={setOutputVolume}
            onChange={(value) =>
              runCommand({ type: 'set_output_volume', volume: value / 100 })
            }
            disabled={offline || snapshot?.outputVolume.muted}
          />
          <Pressable
            disabled={offline}
            style={styles.secondaryButton}
            onPress={() =>
              runCommandNow({
                type: 'set_output_mute',
                muted: !snapshot?.outputVolume.muted,
              })
            }
          >
            <Text style={styles.secondaryButtonText}>
              {snapshot?.outputVolume.muted ? 'Unmute output' : 'Mute output'}
            </Text>
          </Pressable>
        </View>

        {snapshot?.lights.map((light) => {
          const lightLevel =
            lightLevels[light.id] ?? Math.round(light.state.brightness * 100);
          const hasLocalLevel = lightLevels[light.id] !== undefined;

          return (
            <View
              key={light.id}
              style={[styles.panel, offline && styles.panelOffline]}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.label}>{light.label}</Text>
                <Text style={styles.value}>
                  {light.state.on || hasLocalLevel ? `${lightLevel}%` : 'Off'}
                </Text>
              </View>
              <Slider
                value={lightLevel}
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
                disabled={offline}
              />
              <Pressable
                disabled={offline}
                style={styles.secondaryButton}
                onPress={() =>
                  runCommandNow({ type: 'turn_light_off', light: light.id })
                }
              >
                <Text style={styles.secondaryButtonText}>Turn off</Text>
              </Pressable>
            </View>
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
    </View>
  );
}
