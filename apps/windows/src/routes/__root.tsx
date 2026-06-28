import '@/lib/register-pane-fonts';
import '@/styles/shell.css';
import '@/styles/global.css';
import '@/styles/windows.source.css';
import {
  createRootRoute,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
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
    <div className="contents">
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
    </div>
  );
}

function RootOutlet() {
  return <Outlet />;
}
