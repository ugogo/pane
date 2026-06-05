import '@tamagui/web/reset.css';
import './tamagui.generated.css';
import './shell.css';
import './global.css';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import GeistVariable from '../assets/fonts/Geist-Variable.woff2';
import { UIProvider } from '@pane/ui';
import { PaneQueryProvider } from '@/lib/query-provider';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Geist Variable': GeistVariable,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <UIProvider>
      <PaneQueryProvider>
        <Slot />
      </PaneQueryProvider>
    </UIProvider>
  );
}
