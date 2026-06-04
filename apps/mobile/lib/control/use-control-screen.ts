import { useCallback, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompanionCommand, CompanionSnapshot } from '@pane/protocol';
import { sendCommand } from '../api';
import { fetchCompanion } from '../companion-query';
import { STORE_KEY, HEARTBEAT_MS, WRITE_DEBOUNCE_MS } from '../constants';
import { loadStoredPairing } from '../pairing-query';
import { queryKeys } from '../query-keys';

function mergeLightLevels(
  prev: Record<string, number>,
  snapshot: CompanionSnapshot,
) {
  const nextLevels = { ...prev };
  const snapshotIds = new Set(snapshot.lights.map((light) => light.id));
  for (const light of snapshot.lights) {
    const snapshotValue = Math.round(light.state.brightness * 100);
    if (nextLevels[light.id] === snapshotValue) {
      delete nextLevels[light.id];
    }
  }
  for (const id of Object.keys(nextLevels)) {
    if (!snapshotIds.has(id)) delete nextLevels[id];
  }
  return nextLevels;
}

export function useControlScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pairingQuery = useQuery({
    queryKey: queryKeys.pairing,
    queryFn: loadStoredPairing,
  });
  const pairing = pairingQuery.data ?? null;

  useEffect(() => {
    if (pairingQuery.isPending) return;
    if (!pairing) router.replace('/pair');
  }, [pairing, pairingQuery.isPending, router]);

  const companionQuery = useQuery({
    queryKey: pairing ? queryKeys.companion(pairing) : ['companion', 'idle'],
    queryFn: () => fetchCompanion(pairing!),
    enabled: Boolean(pairing),
    refetchInterval: HEARTBEAT_MS,
  });
  const { refetch: refetchCompanion } = companionQuery;

  const [draftBrightness, setDraftBrightness] = useState<number | null>(null);
  const [draftVolume, setDraftVolume] = useState<number | null>(null);
  const [lightLevels, setLightLevels] = useState<Record<string, number>>({});
  const [commandError, setCommandError] = useState<string>();
  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const snapshot = companionQuery.data?.snapshot ?? null;
  const helloName = companionQuery.data?.helloName ?? null;
  const brightness = draftBrightness ?? snapshot?.brightnessPct ?? 50;
  const outputVolume =
    draftVolume ??
    (snapshot ? Math.round(snapshot.outputVolume.volume * 100) : 50);
  const connected =
    companionQuery.isPending && !companionQuery.data
      ? null
      : companionQuery.isError
        ? false
        : true;
  const error =
    commandError ??
    (companionQuery.isError ? String(companionQuery.error) : undefined);

  const displayName = helloName ?? pairing?.name ?? '';

  const syncFromCompanion = useCallback((nextSnapshot: CompanionSnapshot) => {
    setDraftBrightness(null);
    setDraftVolume(null);
    setLightLevels((prev) => mergeLightLevels(prev, nextSnapshot));
  }, []);

  const refresh = useCallback(async () => {
    if (!pairing) return;
    const result = await refetchCompanion();
    if (result.data?.snapshot) syncFromCompanion(result.data.snapshot);
  }, [pairing, refetchCompanion, syncFromCompanion]);

  const runCommand = useCallback(
    (body: CompanionCommand) => {
      if (!pairing) return;
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        void sendCommand(pairing, body)
          .then(() => refresh())
          .catch((err) => {
            setCommandError(String(err));
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
          setCommandError(String(err));
        });
    },
    [pairing, refresh],
  );

  const sleepComputer = useCallback(() => {
    if (!pairing) return;
    void sendCommand(pairing, { type: 'sleep_computer' })
      .then(() => {
        setCommandError(undefined);
      })
      .catch((err) => {
        const message = String(err);
        if (message.includes('AbortError') || message.includes('Network')) {
          setCommandError(undefined);
          return;
        }
        setCommandError(message);
      });
  }, [pairing]);

  const unpair = useCallback(() => {
    void SecureStore.deleteItemAsync(STORE_KEY).then(() => {
      queryClient.setQueryData(queryKeys.pairing, null);
      router.replace('/pair');
    });
  }, [queryClient, router]);

  const offline = connected === false;
  const statusLabel =
    connected === null ? 'CONNECTING' : offline ? 'OFFLINE' : 'CONNECTED';
  const statusColor =
    connected === null ? '#a3a3a3' : offline ? '#f87171' : '#5ed6a8';

  return {
    pairing,
    snapshot,
    brightness,
    setBrightness: setDraftBrightness,
    outputVolume,
    setOutputVolume: setDraftVolume,
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
