import '@/lib/register-pane-fonts';
import '@/styles/shell.css';
import '@/styles/global.css';
import '@/styles/windows.source.css';
import { lazy, Suspense } from 'react';
import {
  createRootRoute,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { isMainShellPath } from '@/lib/main-shell-routes';

const MainAppLayout = lazy(() =>
  import('@/components/main-app-layout').then((module) => ({
    default: module.MainAppLayout,
  })),
);

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
        {isMainShellPath(pathname) ? (
          <Suspense fallback={null}>
            <MainAppLayout>
              <RootOutlet />
            </MainAppLayout>
          </Suspense>
        ) : (
          <RootOutlet />
        )}
      </AppErrorBoundary>
    </div>
  );
}

function RootOutlet() {
  return <Outlet />;
}
