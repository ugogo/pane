import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator } from 'react-native';
import { colors } from '@pane/ui';
import { Screen } from '../components/Screen';
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
        <ActivityIndicator color={colors.foreground} />
      </Screen>
    );
  }

  if (pairingQuery.data) return <Redirect href="/control" />;
  return <Redirect href="/pair" />;
}
