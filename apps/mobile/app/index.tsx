import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator } from 'react-native';
import { Screen } from '../components/Screen';
import { colors } from '../lib/theme';
import { loadStoredPairing } from '../lib/pairing-query';
import { queryKeys } from '../lib/query-keys';

export default function Index() {
  const pairingQuery = useQuery({
    queryKey: queryKeys.pairing,
    queryFn: loadStoredPairing,
  });

  if (pairingQuery.isPending) {
    return (
      <Screen center>
        <ActivityIndicator color={colors.white} />
      </Screen>
    );
  }

  if (pairingQuery.data) return <Redirect href="/control" />;
  return <Redirect href="/pair" />;
}
