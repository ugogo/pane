import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { loadStoredPairing } from '../lib/pairing-query';
import { queryKeys } from '../lib/query-keys';

export default function Index() {
  const pairingQuery = useQuery({
    queryKey: queryKeys.pairing,
    queryFn: loadStoredPairing,
  });

  if (pairingQuery.isPending) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar style="light" />
        <View style={styles.content}>
          <ActivityIndicator color="#fff" />
        </View>
      </SafeAreaView>
    );
  }

  if (pairingQuery.data) return <Redirect href="/control" />;
  return <Redirect href="/pair" />;
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
