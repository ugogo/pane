import '@/lib/register-geist-font';
import '@tamagui/web/reset.css';
import '@/styles/shell.css';
import '@/styles/global.css';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { UIProvider } from '@pane/ui';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { PaneQueryProvider } from '@/lib/query-provider';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <UIProvider>
      <AppErrorBoundary>
        <PaneQueryProvider>
          <Outlet />
        </PaneQueryProvider>
      </AppErrorBoundary>
    </UIProvider>
  );
}
