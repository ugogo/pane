import '@tamagui/web/reset.css';
import './tamagui.generated.css';
import './shell.css';
import './global.css';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import GeistVariable from '../assets/fonts/Geist-Variable.woff2';
import { UIProvider } from '@pane/ui';
import { AppBootFailure } from '@/components/app-boot-failure';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { formatAppError } from '@/lib/format-app-error';
import { PaneQueryProvider } from '@/lib/query-provider';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Geist Variable': GeistVariable,
  });

  if (fontError) {
    return (
      <UIProvider>
        <AppErrorBoundary>
          <AppBootFailure
            title="Couldn't load fonts"
            message={formatAppError(fontError)}
          />
        </AppErrorBoundary>
      </UIProvider>
    );
  }

  if (!fontsLoaded) {
    return null;
  }

  return (
    <UIProvider>
      <AppErrorBoundary>
        <PaneQueryProvider>
          <Slot />
        </PaneQueryProvider>
      </AppErrorBoundary>
    </UIProvider>
  );
}
