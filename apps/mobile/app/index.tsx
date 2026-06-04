import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { isPairing } from '../lib/pairing';
import { STORE_KEY } from '../lib/constants';

export default function Index() {
  const [destination, setDestination] = useState<'pair' | 'control' | null>(
    null,
  );

  useEffect(() => {
    void SecureStore.getItemAsync(STORE_KEY).then((raw) => {
      if (!raw) {
        setDestination('pair');
        return;
      }
      const saved = JSON.parse(raw) as unknown;
      setDestination(isPairing(saved) ? 'control' : 'pair');
    });
  }, []);

  if (destination === 'pair') return <Redirect href="/pair" />;
  if (destination === 'control') return <Redirect href="/control" />;

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <ActivityIndicator color="#fff" />
      </View>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
});
