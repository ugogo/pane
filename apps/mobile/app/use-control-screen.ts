import { useCallback, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import {
  ENDPOINTS,
  type CompanionCommand,
  type CompanionSnapshot,
  type HelloResponse,
} from '@pane/protocol';
import { fetchWithTimeout, fetchSnapshot, sendCommand } from '../lib/api';
import { baseUrl, isPairing } from '../lib/pairing';
import {
  STORE_KEY,
  HEARTBEAT_MS,
  WRITE_DEBOUNCE_MS,
  REQUEST_TIMEOUT_MS,
} from '../lib/constants';
import type { Pairing } from '../lib/types';

export function useControlScreen() {
  const router = useRouter();
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [helloName, setHelloName] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<CompanionSnapshot | null>(null);
  const [brightness, setBrightness] = useState(50);
  const [outputVolume, setOutputVolume] = useState(50);
  const [lightLevels, setLightLevels] = useState<Record<string, number>>({});
  const [error, setError] = useState<string>();
  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    void SecureStore.getItemAsync(STORE_KEY).then((raw) => {
      if (!raw) {
        router.replace('/pair');
        return;
      }
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

  const offline = connected === false;
  const statusLabel =
    connected === null ? 'CONNECTING' : offline ? 'OFFLINE' : 'CONNECTED';
  const statusColor =
    connected === null ? '#a3a3a3' : offline ? '#f87171' : '#5ed6a8';

  return {
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
  };
}
