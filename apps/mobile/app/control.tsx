import { ScrollView } from 'react-native';
import { Button, Card, Label, MutedText, Text, YStack } from '@pane/ui';
import { Screen } from '../components/Screen';
import { ControlSystemControls } from '../lib/control/control-system-controls';
import { SliderPanel } from '../lib/control/slider-panel';
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
        contentContainerStyle={{ gap: 16, padding: 24, paddingBottom: 40 }}
        style={{ flex: 1 }}
      >
        <YStack gap="$2">
          <Text fontSize="$2" fontWeight="700" style={{ color: statusColor }}>
            {statusLabel}
          </Text>
          <Text fontSize="$9" fontWeight="700">
            {displayName}
          </Text>
        </YStack>

        <SliderPanel
          label="Brightness"
          valueText={`${brightness}%`}
          value={brightness}
          offline={offline}
          onValueChange={setBrightness}
          onChange={(value) => runCommand({ type: 'set_brightness', value })}
        />

        {snapshot && snapshot.presets.length > 0 ? (
          <Card offline={offline}>
            <Label>Monitor presets</Label>
            <YStack flexDirection="row" flexWrap="wrap" gap="$2" marginTop="$3">
              {snapshot.presets.map((preset) => (
                <Button
                  key={preset.name}
                  disabled={offline}
                  btnScale="sm"
                  appearance="secondary"
                  onPress={() =>
                    runCommandNow({
                      type: 'apply_monitor_preset',
                      name: preset.name,
                    })
                  }
                >
                  {preset.name}
                </Button>
              ))}
            </YStack>
          </Card>
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
          <MutedText>
            Can&apos;t reach Pane. Make sure it&apos;s running on your desktop
            and on the same Wi-Fi. If your desktop IP changed, pair again.
          </MutedText>
        ) : null}

        {error ? (
          <Text color="$red11" fontSize="$3">
            {error}
          </Text>
        ) : null}

        <Button chromeless onPress={unpair}>
          <MutedText textDecorationLine="underline">
            Unpair this iPhone
          </MutedText>
        </Button>
      </ScrollView>
    </Screen>
  );
}
