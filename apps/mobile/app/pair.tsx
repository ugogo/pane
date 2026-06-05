import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { generateKeyPair, ENDPOINTS, type PairResponse } from '@pane/protocol';
import { Button, colors, MutedText, Text, View, YStack } from '@pane/ui';
import { Screen } from '../components/Screen';
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
        <ActivityIndicator color={colors.foreground} />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <YStack flex={1} gap="$5" justifyContent="center" padding="$6">
          <Text fontSize="$9" fontWeight="700">
            Pane Companion
          </Text>
          <MutedText fontSize="$4" lineHeight={22}>
            Camera access is needed to scan the pairing code shown in Pane on
            your desktop.
          </MutedText>
          <Button onPress={() => void requestPermission()}>
            <Text>Allow camera</Text>
          </Button>
        </YStack>
      </Screen>
    );
  }

  return (
    <Screen>
      <YStack gap="$2" padding="$6">
        <Text fontSize="$9" fontWeight="700">
          Scan Pane
        </Text>
        <MutedText fontSize="$4" lineHeight={22}>
          Point the camera at the QR code in Pane&apos;s Companion panel.
        </MutedText>
      </YStack>
      <View
        backgroundColor="$black"
        marginHorizontal="$6"
        overflow="hidden"
        borderRadius="$8"
        style={{ aspectRatio: 1 }}
      >
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => void onScan(data)}
        />
        {pairing ? (
          <View
            alignItems="center"
            justifyContent="center"
            gap="$3"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: colors.scrim,
            }}
          >
            <ActivityIndicator color={colors.foreground} />
            <MutedText>Pairing…</MutedText>
          </View>
        ) : null}
      </View>
      {error ? (
        <Text color="$red11" fontSize="$3" padding="$6">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}
