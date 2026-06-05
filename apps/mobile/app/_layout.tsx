import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UIProvider } from '@pane/ui';
import { PaneQueryProvider } from '../lib/query-provider';

export default function RootLayout() {
  return (
    <UIProvider>
      <PaneQueryProvider>
        <SafeAreaProvider>
          <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
        </SafeAreaProvider>
      </PaneQueryProvider>
    </UIProvider>
  );
}
