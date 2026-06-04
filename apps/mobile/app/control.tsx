import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import {
  ENDPOINTS,
  type CompanionCommand,
  type CompanionSnapshot,
  type HelloResponse,
} from '@pane/protocol';
import { Slider } from '../components/Slider';
import { fetchWithTimeout, fetchSnapshot, sendCommand } from '../lib/api';
import { baseUrl, isPairing } from '../lib/pairing';
import { STORE_KEY, HEARTBEAT_MS, WRITE_DEBOUNCE_MS, REQUEST_TIMEOUT_MS } from '../lib/constants';
import type { Pairing } from '../lib/types';

export default function ControlScreen() {
  const router = useRouter();
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [helloName, setHelloName] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<CompanionSnapshot | null>(null);
  const [brightness, setBrightness] = useState(50);
  const [outputVolume, setOutputVolume] = useState(50);
  const [lightLevels, setLightLevels] = useState<Record<string, number>>({});
  const [error, setError] = useState<string>();
  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load pairing from SecureStore on mount; redirect to /pair if missing.
  useEffect(() => {
    void SecureStore.getItemAsync(STORE_KEY).then((raw) => {
      if (!raw) { router.replace('/pair'); return; }
      const saved = JSON.parse(raw) as unknown;
      if (isPairing(saved)) {
        setPairing(saved);
      } else {
        router.replace('/pair');
      }
    });
  }, [router]);

  const displayName = helloName ?? pairing?.name ?? '';

  const applySnapshot = useCallback((next: CompanionSnapshot) => {
    setSnapshot(next);
    setBrightness(next.brightnessPct);
    setOutputVolume(Math.round(next.outputVolume.volume * 100));
    setLightLevels((prev) => {
      const nextLevels = { ...prev };
      const snapshotIds = new Set(next.lights.map((light) => light.id));
      for (const light of next.lights) {
        const snapshotValue = Math.round(light.state.brightness * 100);
        if (nextLevels[light.id] === snapshotValue) {
          delete nextLevels[light.id];
        }
      }
      for (const id of Object.keys(nextLevels)) {
        if (!snapshotIds.has(id)) delete nextLevels[id];
      }
      return nextLevels;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!pairing) return;
    const response = await fetchWithTimeout(
      `${baseUrl(pairing)}${ENDPOINTS.hello}`,
      {},
      REQUEST_TIMEOUT_MS,
    );
    if (!response.ok) throw new Error(`hello ${response.status}`);
    const hello = (await response.json()) as HelloResponse;
    setHelloName(hello.name);
    const snap = await fetchSnapshot(pairing);
    applySnapshot(snap);
    setConnected(true);
    setError(undefined);
  }, [applySnapshot, pairing]);

  useEffect(() => {
    if (!pairing) return;
    let cancelled = false;

    const tick = async () => {
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setConnected(false);
          setError(String(err));
        }
      }
    };

    void tick();
    const id = setInterval(() => void tick(), HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refresh, pairing]);

  const runCommand = useCallback(
    (body: CompanionCommand) => {
      if (!pairing) return;
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        void sendCommand(pairing, body)
          .then(() => refresh())
          .catch((err) => {
            setError(String(err));
            setConnected(false);
          });
      }, WRITE_DEBOUNCE_MS);
    },
    [pairing, refresh],
  );

  const runCommandNow = useCallback(
    (body: CompanionCommand) => {
      if (!pairing) return;
      void sendCommand(pairing, body)
        .then(() => refresh())
        .catch((err) => {
          setError(String(err));
          setConnected(false);
        });
    },
    [pairing, refresh],
  );

  const sleepComputer = useCallback(() => {
    if (!pairing) return;
    void sendCommand(pairing, { type: 'sleep_computer' })
      .then(() => {
        setConnected(false);
        setError(undefined);
      })
      .catch((err) => {
        const message = String(err);
        if (message.includes('AbortError') || message.includes('Network')) {
          setConnected(false);
          setError(undefined);
          return;
        }
        setError(message);
        setConnected(false);
      });
  }, [pairing]);

  const unpair = useCallback(() => {
    void SecureStore.deleteItemAsync(STORE_KEY).then(() => {
      router.replace('/pair');
    });
  }, [router]);

  if (!pairing) return null;

  const offline = connected === false;
  const statusLabel =
    connected === null ? 'CONNECTING' : offline ? 'OFFLINE' : 'CONNECTED';
  const statusColor =
    connected === null ? '#a3a3a3' : offline ? '#f87171' : '#5ed6a8';

  return (
    <View style={styles.shell}>
      <StatusBar style="light" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: statusColor }]}>{statusLabel}</Text>
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
                  onPress={() => runCommandNow({ type: 'apply_monitor_preset', name: preset.name })}
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
            onChange={(value) => runCommand({ type: 'set_output_volume', volume: value / 100 })}
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
            <View key={light.id} style={[styles.panel, offline && styles.panelOffline]}>
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
                onPress={() => runCommandNow({ type: 'turn_light_off', light: light.id })}
              >
                <Text style={styles.secondaryButtonText}>Turn off</Text>
              </Pressable>
            </View>
          );
        }) ?? null}

        {snapshot ? (
          <SystemControls
            offline={offline}
            snapshot={snapshot}
            onCommand={runCommandNow}
            onSleep={sleepComputer}
          />
        ) : null}

        {offline ? (
          <Text style={styles.body}>
            Can&apos;t reach Pane. Make sure it&apos;s running on your desktop and on the same
            Wi-Fi. If your desktop IP changed, pair again.
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

function SystemControls({
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
          onValueChange={(enabled) => onCommand({ type: 'set_accent_popup_enabled', enabled })}
        />
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.label}>Run at startup</Text>
        <Switch
          disabled={offline}
          value={snapshot.runAtStartup}
          onValueChange={(enabled) => onCommand({ type: 'set_run_at_startup', enabled })}
        />
      </View>
      <Pressable disabled={offline} style={styles.secondaryButton} onPress={onSleep}>
        <Text style={styles.secondaryButtonText}>Sleep computer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#0b0b0c',
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 16,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    gap: 6,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: '#fafafa',
    fontSize: 28,
    fontWeight: '700',
  },
  body: {
    color: '#a3a3a3',
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    color: '#fafafa',
    fontSize: 16,
    fontWeight: '600',
  },
  value: {
    color: '#a3a3a3',
    fontSize: 16,
  },
  panel: {
    backgroundColor: '#161618',
    borderColor: '#262629',
    borderRadius: 16,
    borderWidth: 1,
    gap: 18,
    padding: 20,
  },
  panelOffline: {
    opacity: 0.5,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    backgroundColor: '#2a2a2e',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    color: '#fafafa',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#2a2a2e',
    borderRadius: 10,
    marginTop: 8,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#fafafa',
    fontSize: 14,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  linkText: {
    color: '#a3a3a3',
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    color: '#f87171',
    fontSize: 14,
  },
});
