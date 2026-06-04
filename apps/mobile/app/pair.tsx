import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { generateKeyPair, ENDPOINTS, type PairResponse } from '@pane/protocol';
import { parsePairingUri, baseUrl } from '../lib/pairing';
import { STORE_KEY, DEVICE_NAME } from '../lib/constants';
import type { Pairing } from '../lib/types';

export default function PairScreen() {
  const router = useRouter();
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
        router.replace('/control');
      } catch (err) {
        setError(String(err));
        handled.current = false;
        setPairing(false);
      }
    },
    [router],
  );

  if (!permission) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar style="light" />
        <View style={styles.content}>
          <ActivityIndicator color="#fff" />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar style="light" />
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
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
            <ActivityIndicator color="#fff" />
            <Text style={styles.body}>Pairing&hellip;</Text>
          </View>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  scannerHeader: {
    gap: 8,
    padding: 24,
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
  error: {
    color: '#f87171',
    fontSize: 14,
    padding: 24,
  },
});
