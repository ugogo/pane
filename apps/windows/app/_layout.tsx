import '@/lib/register-geist-font';
import '@tamagui/web/reset.css';
import './shell.css';
import './global.css';
import { Slot } from 'expo-router';
import { UIProvider } from '@pane/ui';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { PaneQueryProvider } from '@/lib/query-provider';

export default function RootLayout() {
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
