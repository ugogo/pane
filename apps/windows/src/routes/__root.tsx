import '@/lib/register-geist-font';
import '@tamagui/web/reset.css';
import '@/styles/shell.css';
import '@/styles/global.css';
import {
  createRootRoute,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { UIProvider } from '@pane/ui';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { MainShell } from '@/components/app-shell';
import { isMainShellPath } from '@/lib/main-shell-routes';
import { PaneQueryProvider } from '@/lib/query-provider';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <UIProvider>
      <AppErrorBoundary>
        <PaneQueryProvider>
          {isMainShellPath(pathname) ? (
            <MainShell>
              <RootOutlet />
            </MainShell>
          ) : (
            <RootOutlet />
          )}
        </PaneQueryProvider>
      </AppErrorBoundary>
    </UIProvider>
  );
}

function RootOutlet() {
  return <Outlet />;
}
