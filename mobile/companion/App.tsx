import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {
  ENDPOINTS,
  generateKeyPair,
  signedHeaders,
  type CompanionCommand,
  type CompanionSnapshot,
  type HelloResponse,
  type PairResponse,
} from '@pane/protocol';

// Where the issued bearer credentials live between launches.
const STORE_KEY = 'pane.pairing.v1';
// This device's display name shown in Pane's trusted-devices list.
const DEVICE_NAME = 'iPhone';
// Debounce command writes so dragging the slider doesn't flood the desktop.
const WRITE_DEBOUNCE_MS = 120;
// Poll the desktop so we notice it going away (server stopped, app closed).
const HEARTBEAT_MS = 4000;
// Cap each request so an unreachable host fails fast instead of hanging on the
// TCP timeout (RN fetch has no default timeout).
const REQUEST_TIMEOUT_MS = 4000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface Pairing {
  scheme: 'http';
  host: string;
  port: number;
  deviceToken: string;
  privateKey: string;
  publicKey: string;
  name: string;
}

interface ParsedUri {
  scheme: 'http';
  host: string;
  port: number;
  token: string;
}

// Parse a `pane://pair?host=..&port=..&token=..` QR payload. Custom-scheme URLs
// parse unreliably across platforms, so read the query string by hand.
function parsePairingUri(data: string): ParsedUri | null {
  if (!data.startsWith('pane://pair')) return null;
  const query = data.slice(data.indexOf('?') + 1);
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    const [key, value] = pair.split('=');
    if (key) params.set(key, decodeURIComponent(value ?? ''));
  }
  const host = params.get('host');
  const port = Number(params.get('port'));
  const token = params.get('token');
  const scheme = params.get('scheme');
  if (scheme !== 'http' || !host || !Number.isInteger(port) || !token) {
    return null;
  }
  return { scheme, host, port, token };
}

function baseUrl(pairing: Pick<Pairing, 'host' | 'port'>): string {
  return `http://${pairing.host}:${pairing.port}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

function isPairing(value: unknown): value is Pairing {
  const candidate = value as Partial<Pairing>;
  return (
    candidate?.scheme === 'http' &&
    typeof candidate.host === 'string' &&
    typeof candidate.port === 'number' &&
    typeof candidate.deviceToken === 'string' &&
    typeof candidate.privateKey === 'string' &&
    typeof candidate.publicKey === 'string'
  );
}

function randomNonce(): string {
  return bytesToHex(Crypto.getRandomBytes(16));
}

// Adapt the platform-agnostic @pane/protocol signer to this device's keys,
// supplying a fresh expo-crypto nonce per request.
function headersFor(
  pairing: Pairing,
  method: string,
  path: string,
  body = '',
): Record<string, string> {
  return signedHeaders({
    privateKey: pairing.privateKey,
    deviceToken: pairing.deviceToken,
    method,
    path,
    body,
    nonce: randomNonce(),
  });
}

async function fetchSnapshot(pairing: Pairing): Promise<CompanionSnapshot> {
  const response = await fetchWithTimeout(
    `${baseUrl(pairing)}${ENDPOINTS.snapshot}`,
    { headers: headersFor(pairing, 'GET', ENDPOINTS.snapshot) },
    REQUEST_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`snapshot ${response.status}`);
  return (await response.json()) as CompanionSnapshot;
}

async function sendCommand(
  pairing: Pairing,
  body: CompanionCommand,
): Promise<void> {
  const encodedBody = JSON.stringify(body);
  const response = await fetchWithTimeout(
    `${baseUrl(pairing)}${ENDPOINTS.commands}`,
    {
      method: 'POST',
      headers: headersFor(pairing, 'POST', ENDPOINTS.commands, encodedBody),
      body: encodedBody,
    },
    REQUEST_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`Command failed (${response.status})`);
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  // `undefined` while we read SecureStore, then `null` (unpaired) or a Pairing.
  const [pairing, setPairing] = useState<Pairing | null | undefined>(undefined);

  useEffect(() => {
    void SecureStore.getItemAsync(STORE_KEY).then((raw) => {
      if (!raw) {
        setPairing(null);
        return;
      }
      const saved = JSON.parse(raw) as unknown;
      setPairing(isPairing(saved) ? saved : null);
    });
  }, []);

  const persist = useCallback(async (next: Pairing | null) => {
    if (next) await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(next));
    else await SecureStore.deleteItemAsync(STORE_KEY);
    setPairing(next);
  }, []);

  if (pairing === undefined) {
    return (
      <Screen>
        <ActivityIndicator color="#fff" />
      </Screen>
    );
  }

  return pairing ? (
    <ControlScreen pairing={pairing} onUnpair={() => void persist(null)} />
  ) : (
    <PairScreen onPaired={(next) => void persist(next)} />
  );
}

function PairScreen({ onPaired }: { onPaired: (pairing: Pairing) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string>();
  const [pairing, setPairing] = useState(false);
  // Guard against the camera firing multiple scans for one code.
  const handled = useRef(false);

  const onScan = useCallback(
    async (data: string) => {
      if (handled.current) return;
      const parsed = parsePairingUri(data);
      if (!parsed) return;
      handled.current = true;
      setPairing(true);
      setError(undefined);

      try {
        const keys = generateKeyPair(Crypto.getRandomBytes(32));
        const response = await fetch(`${baseUrl(parsed)}${ENDPOINTS.pair}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: parsed.token,
            name: DEVICE_NAME,
            publicKey: keys.publicKey,
          }),
        });
        if (!response.ok) {
          throw new Error(`Pairing rejected (${response.status})`);
        }
        const body = (await response.json()) as PairResponse;
        onPaired({
          scheme: parsed.scheme,
          host: parsed.host,
          port: parsed.port,
          deviceToken: body.deviceToken,
          privateKey: keys.privateKey,
          publicKey: keys.publicKey,
          name: DEVICE_NAME,
        });
      } catch (err) {
        setError(String(err));
        handled.current = false;
        setPairing(false);
      }
    },
    [onPaired],
  );

  if (!permission) {
    return (
      <Screen>
        <ActivityIndicator color="#fff" />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Text style={styles.title}>Pane Companion</Text>
        <Text style={styles.body}>
          Camera access is needed to scan the pairing code shown in Pane on your
          desktop.
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => void requestPermission()}
        >
          <Text style={styles.buttonText}>Allow camera</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar barStyle="light-content" />
      <View style={styles.scannerHeader}>
        <Text style={styles.title}>Scan Pane</Text>
        <Text style={styles.body}>
          Point the camera at the QR code in Pane&rsquo;s Companion panel.
        </Text>
      </View>
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => void onScan(data)}
        />
        {pairing ? (
          <View style={styles.cameraOverlay}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.body}>Pairing&hellip;</Text>
          </View>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </SafeAreaView>
  );
}

function ControlScreen({
  pairing,
  onUnpair,
}: {
  pairing: Pairing;
  onUnpair: () => void;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [helloName, setHelloName] = useState<string | null>(null);
  const displayName = helloName ?? pairing.name;
  const [snapshot, setSnapshot] = useState<CompanionSnapshot | null>(null);
  const [brightness, setBrightness] = useState(50);
  const [outputVolume, setOutputVolume] = useState(50);
  const [lightLevels, setLightLevels] = useState<Record<string, number>>({});
  const [error, setError] = useState<string>();
  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

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
  }, [refresh]);

  const runCommand = useCallback(
    (body: CompanionCommand) => {
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
      void sendCommand(pairing, body)
        .then(() => refresh())
        .catch((err) => {
          setError(String(err));
          setConnected(false);
        });
    },
    [pairing, refresh],
  );

  const offline = connected === false;
  const statusLabel =
    connected === null ? 'CONNECTING' : offline ? 'OFFLINE' : 'CONNECTED';
  const statusColor =
    connected === null ? '#a3a3a3' : offline ? '#f87171' : '#5ed6a8';

  return (
    <View style={styles.shell}>
      <StatusBar barStyle="light-content" />
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
          <View style={[styles.panel, offline && styles.panelOffline]}>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>Accent popup</Text>
              <Switch
                disabled={offline}
                value={snapshot.accentPopupEnabled}
                onValueChange={(enabled) =>
                  runCommandNow({ type: 'set_accent_popup_enabled', enabled })
                }
              />
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>Run at startup</Text>
              <Switch
                disabled={offline}
                value={snapshot.runAtStartup}
                onValueChange={(enabled) =>
                  runCommandNow({ type: 'set_run_at_startup', enabled })
                }
              />
            </View>
          </View>
        ) : null}

        {offline ? (
          <Text style={styles.body}>
            Can&rsquo;t reach Pane. Make sure it&rsquo;s running on your desktop
            and on the same Wi-Fi. If your desktop IP changed, pair again.
          </Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.linkButton} onPress={onUnpair}>
          <Text style={styles.linkText}>Unpair this iPhone</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// Expo Go-compatible slider using native gesture recognition. It maps the
// gesture's absolute X position against the track's measured window position.
function Slider({
  value,
  onValueChange,
  onChange,
  disabled = false,
}: {
  value: number;
  onValueChange?: (value: number) => void;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<View>(null);
  const leftRef = useRef(0);
  const widthRef = useRef(0);
  const onValueChangeRef = useRef(onValueChange);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  onValueChangeRef.current = onValueChange;
  onChangeRef.current = onChange;
  disabledRef.current = disabled;

  const measure = () => {
    trackRef.current?.measureInWindow((x, _y, width) => {
      leftRef.current = x;
      widthRef.current = width;
    });
  };

  const emitFromPosition = (pageX: number, commit: boolean) => {
    const width = widthRef.current;
    if (width <= 0) return;
    const offset = pageX - leftRef.current;
    const ratio = Math.max(0, Math.min(1, offset / width));
    const next = Math.round(ratio * 100);
    onValueChangeRef.current?.(next);
    if (commit) onChangeRef.current(next);
  };

  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
    .runOnJS(true)
    .onEnd((event, success) => {
      if (success) {
        measure();
        emitFromPosition(event.absoluteX, true);
      }
    });

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .runOnJS(true)
    .onBegin((event) => {
      measure();
      emitFromPosition(event.absoluteX, false);
    })
    .onUpdate((event) => emitFromPosition(event.absoluteX, false))
    .onFinalize((event) => emitFromPosition(event.absoluteX, true));

  const sliderGesture = Gesture.Race(tapGesture, panGesture);

  return (
    <GestureDetector gesture={sliderGesture}>
      <View ref={trackRef} hitSlop={16} style={styles.track} onLayout={measure}>
        <View
          pointerEvents="none"
          style={[styles.fill, { width: `${value}%` }]}
        />
        <View
          pointerEvents="none"
          style={[styles.thumb, { left: `${value}%` }]}
        />
      </View>
    </GestureDetector>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  shell: {
    backgroundColor: '#0b0b0c',
    flex: 1,
  },
  content: {
    flex: 1,
    gap: 20,
    justifyContent: 'center',
    padding: 24,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 16,
    padding: 24,
    paddingBottom: 40,
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
  scannerHeader: {
    gap: 8,
    padding: 24,
  },
  header: {
    gap: 6,
  },
  eyebrow: {
    color: '#5ed6a8',
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
    fontVariant: ['tabular-nums'],
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
  track: {
    backgroundColor: '#2a2a2e',
    borderRadius: 999,
    height: 8,
    justifyContent: 'center',
    marginVertical: 12,
  },
  fill: {
    backgroundColor: '#5ed6a8',
    borderRadius: 999,
    height: 8,
  },
  thumb: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    height: 24,
    marginLeft: -12,
    position: 'absolute',
    width: 24,
  },
  cameraWrap: {
    aspectRatio: 1,
    backgroundColor: '#000',
    borderRadius: 24,
    marginHorizontal: 24,
    overflow: 'hidden',
  },
  cameraOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    bottom: 0,
    gap: 12,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#5ed6a8',
    borderRadius: 12,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#0b0b0c',
    fontSize: 16,
    fontWeight: '700',
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
