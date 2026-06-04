import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaneQueryProvider } from '../lib/query-provider';

export default function RootLayout() {
  return (
    <PaneQueryProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </PaneQueryProvider>
  );
}
