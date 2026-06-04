import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { generateKeyPair, ENDPOINTS, type PairResponse } from '@pane/protocol';
import { Screen } from '../components/Screen';
import { colors } from '../lib/theme';
import { parsePairingUri, baseUrl } from '../lib/pairing';
import { STORE_KEY, DEVICE_NAME } from '../lib/constants';
import { queryKeys } from '../lib/query-keys';
import type { Pairing } from '../lib/types';

export default function PairScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
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
        const newPairing: Pairing = {
          scheme: parsed.scheme,
          host: parsed.host,
          port: parsed.port,
          deviceToken: body.deviceToken,
          privateKey: keys.privateKey,
          publicKey: keys.publicKey,
          name: DEVICE_NAME,
        };
        await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(newPairing));
        queryClient.setQueryData(queryKeys.pairing, newPairing);
        router.replace('/control');
      } catch (err) {
        setError(String(err));
        handled.current = false;
        setPairing(false);
      }
    },
    [queryClient, router],
  );

  if (!permission) {
    return (
      <Screen center>
        <ActivityIndicator color={colors.white} />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <View style={styles.content}>
          <Text style={styles.title}>Pane Companion</Text>
          <Text style={styles.body}>
            Camera access is needed to scan the pairing code shown in Pane on
            your desktop.
          </Text>
          <Pressable
            style={styles.button}
            onPress={() => void requestPermission()}
          >
            <Text style={styles.buttonText}>Allow camera</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.scannerHeader}>
        <Text style={styles.title}>Scan Pane</Text>
        <Text style={styles.body}>
          Point the camera at the QR code in Pane&apos;s Companion panel.
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
            <ActivityIndicator color={colors.white} />
            <Text style={styles.body}>Pairing&hellip;</Text>
          </View>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: 20,
    justifyContent: 'center',
    padding: 24,
  },
  scannerHeader: {
    gap: 8,
    padding: 24,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  cameraWrap: {
    aspectRatio: 1,
    backgroundColor: colors.cameraBackground,
    borderRadius: 24,
    marginHorizontal: 24,
    overflow: 'hidden',
  },
  cameraOverlay: {
    alignItems: 'center',
    backgroundColor: colors.cameraOverlay,
    bottom: 0,
    gap: 12,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    padding: 24,
  },
});
