import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  ActivityIcon,
  AlertTriangleIcon,
  CameraIcon,
  CheckIcon,
  DownloadIcon,
  LanguagesIcon,
  LightbulbIcon,
  Loader2Icon,
  MinusIcon,
  MonitorIcon,
  PowerIcon,
  RotateCcwIcon,
  SmartphoneIcon,
  SquareIcon,
  Volume2Icon,
  XIcon,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Button, Card, Text } from 'pickle-ui';
import { AppBootFailure } from '@/components/app-boot-failure';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { APP_DISPLAY_NAME } from '@/lib/app-name';
import { useAppBoot } from '@/lib/use-app-boot';
import { UpdateCheckContext } from '@/lib/update-check-context';
import { useUpdateCheck, type UpdateNoticeState } from '@/lib/use-update-check';
import { restartToApplyUpdate } from '@/lib/updater';

const SHELL_SURFACE =
  'relative isolate overflow-hidden bg-[var(--app-shell-nav)] backdrop-blur-[34px] backdrop-saturate-[1.35] backdrop-brightness-[0.68]';

const TITLEBAR = `${SHELL_SURFACE} relative z-10 flex h-9 select-none items-center border-b border-border shadow-[inset_0_1px_0_var(--app-white-08),inset_0_-1px_0_var(--app-black-20)]`;

const WINDOW_CONTROL =
  'grid h-9 w-[46px] cursor-pointer place-items-center border-0 bg-transparent p-0 text-[var(--app-foreground-control)] transition-[color,background-color] duration-120 hover:bg-[var(--app-white-09)] hover:text-[var(--app-foreground-control-hover)]';

const NAV_LINK_BASE =
  'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm no-underline transition-[background-color,color] duration-120 ease-in-out max-md:min-w-max md:min-w-0';

const modules = [
  {
    path: '/capture',
    label: 'Capture',
    title: 'Capture',
    description: 'Fullscreen and area capture with global shortcuts.',
    icon: CameraIcon,
  },
  {
    path: '/display',
    label: 'Display',
    title: 'Display',
    description: 'Monitor brightness and presets.',
    icon: MonitorIcon,
  },
  {
    path: '/sound',
    label: 'Sound',
    title: 'Sound',
    description: 'Default devices and volume.',
    icon: Volume2Icon,
  },
  {
    path: '/lights',
    label: 'Lights',
    title: 'Lights',
    description: 'Supported lighting hardware.',
    icon: LightbulbIcon,
  },
  {
    path: '/accent',
    label: 'Accents',
    title: 'Accents',
    description: 'Long-press letters for variants.',
    icon: LanguagesIcon,
  },
  {
    path: '/startup',
    label: 'System',
    title: 'System',
    description: 'Windows launch and power commands.',
    icon: PowerIcon,
  },
  {
    path: '/companion',
    label: 'Companion',
    title: 'Companion',
    description: 'Control Pane settings from your iPhone.',
    icon: SmartphoneIcon,
  },
  {
    path: '/diagnostics',
    label: 'Diagnostics',
    title: 'Diagnostics',
    description: 'Memory, startup timing, and process ID.',
    icon: ActivityIcon,
  },
] as const;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MainShell({ children }: { children: ReactNode }) {
  const { isBooting, appVersion, bootError } = useAppBoot();
  const updateCheck = useUpdateCheck();

  if (bootError) return <AppBootFailure message={bootError} />;

  if (isBooting) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <AppTitlebar />
        <output
          className="flex flex-1 items-center justify-center bg-background"
          aria-label="Starting Pane"
        >
          <Loader2Icon
            aria-hidden
            className="animate-spin text-muted-foreground"
            size={16}
          />
        </output>
      </div>
    );
  }

  return (
    <MainShellErrorBoundary>
      <UpdateCheckContext.Provider value={updateCheck}>
        <AppShell
          appVersion={appVersion}
          updateNotice={updateCheck.notice}
          onInstallUpdate={updateCheck.install}
        >
          {children}
        </AppShell>
      </UpdateCheckContext.Provider>
    </MainShellErrorBoundary>
  );
}

function MainShellErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <AppErrorBoundary
      renderFallback={(message) => (
        <AppBootFailure title="Pane ran into a problem" message={message} />
      )}
    >
      {children}
    </AppErrorBoundary>
  );
}

function AppShell({
  appVersion,
  updateNotice,
  onInstallUpdate,
  children,
}: {
  appVersion: string | null;
  updateNotice: UpdateNoticeState;
  onInstallUpdate: () => void;
  children: ReactNode;
}) {
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const activeModule = modules.find((m) => m.path === pathname) ?? modules[0];

  useLayoutEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <AppTitlebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-row max-md:flex-col">
        <div
          className={`${SHELL_SURFACE} w-[200px] shrink-0 border-r border-[var(--app-border-medium)] px-4 py-5 shadow-[inset_-1px_0_0_var(--app-black-16),inset_1px_0_0_var(--app-white-12)] max-md:w-full max-md:border-r-0 max-md:border-b max-md:border-b-[var(--app-white-09)] max-md:px-3 max-md:py-2.5 [&>*]:relative [&>*]:z-[1]`}
        >
          <nav
            aria-label="Pane modules"
            className="flex flex-col gap-1 max-md:flex-row max-md:overflow-x-auto max-md:pb-0.5"
          >
            {modules.map(({ path, label, icon: Icon }) => {
              const isActive = pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  aria-current={isActive ? 'page' : undefined}
                  className={
                    isActive
                      ? `${NAV_LINK_BASE} bg-[var(--app-white-10)] text-foreground`
                      : `${NAV_LINK_BASE} text-[var(--app-foreground-subtle)] hover:bg-[var(--app-white-08)] hover:text-foreground`
                  }
                >
                  <Icon aria-hidden size={16} />
                  <Text as="span">{label}</Text>
                </Link>
              );
            })}
          </nav>
        </div>

        <div
          ref={contentScrollRef}
          className="min-w-0 flex-1 overflow-y-auto bg-background"
        >
          <header className="sticky top-0 z-10 border-b border-border bg-background px-8 py-6">
            <div className="mx-auto flex w-full max-w-190 items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <Text as="h1" variant="h2" weight="bold">
                  {activeModule.title}
                </Text>
                <Text tone="muted">{activeModule.description}</Text>
              </div>
              <div className="shrink-0">
                <Text variant="code">
                  {appVersion ?? 'version unavailable'}
                </Text>
              </div>
            </div>
          </header>

          <main
            key={pathname}
            className="mx-auto w-full max-w-190 space-y-5 px-8 py-6"
          >
            <UpdateNotice
              state={updateNotice}
              onInstall={onInstallUpdate}
              onRestart={() => void restartToApplyUpdate()}
            />
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function AppTitlebar() {
  return (
    <div
      className={TITLEBAR}
      data-tauri-drag-region
      role="presentation"
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement;
        if (target.closest('button')) return;
        void getCurrentWindow().startDragging().catch(console.error);
      }}
    >
      <div
        className="flex min-w-0 items-center gap-2 px-3"
        data-tauri-drag-region
      >
        <span
          className="flex size-4 items-center justify-center rounded bg-primary text-primary-foreground"
          data-tauri-drag-region
        >
          <CameraIcon aria-hidden size={12} />
        </span>
        <span
          className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--app-foreground-soft)]"
          data-tauri-drag-region
        >
          <Text as="span" variant="small">
            {APP_DISPLAY_NAME}
          </Text>
        </span>
      </div>
      <div className="ml-auto flex h-full">
        <button
          aria-label="Minimize"
          className={WINDOW_CONTROL}
          type="button"
          onClick={() =>
            void getCurrentWindow().minimize().catch(console.error)
          }
        >
          <MinusIcon aria-hidden size={14} />
        </button>
        <button
          aria-label="Maximize or restore"
          className={WINDOW_CONTROL}
          type="button"
          onClick={() =>
            void getCurrentWindow().toggleMaximize().catch(console.error)
          }
        >
          <SquareIcon aria-hidden size={12} />
        </button>
        <button
          aria-label="Close to tray"
          className={`${WINDOW_CONTROL} hover:bg-[var(--app-close-hover)] hover:text-foreground`}
          type="button"
          onClick={() => void getCurrentWindow().hide().catch(console.error)}
        >
          <XIcon aria-hidden size={14} />
        </button>
      </div>
    </div>
  );
}

function UpdateNotice({
  state,
  onInstall,
  onRestart,
}: {
  state: UpdateNoticeState;
  onInstall: () => void;
  onRestart: () => void;
}) {
  if (state.status === 'hidden') return null;

  if (state.status === 'error') {
    return (
      <Card>
        <Card.Content>
          <div className="flex items-start gap-2 text-destructive">
            <AlertTriangleIcon aria-hidden className="shrink-0" size={16} />
            <div className="min-w-0 flex-1">
              <Text tone="destructive" weight="bold">
                Update failed
              </Text>
              <Text tone="destructive">{state.message}</Text>
            </div>
          </div>
        </Card.Content>
      </Card>
    );
  }

  if (state.status === 'installed') {
    return (
      <NoticeCard
        icon={<CheckIcon aria-hidden size={16} />}
        title={`Pane ${state.version} is installed`}
        description="Restart when ready."
      >
        <Button onClick={onRestart}>
          <RotateCcwIcon aria-hidden size={16} />
          Restart
        </Button>
      </NoticeCard>
    );
  }

  const isInstalling = state.status === 'installing';
  const progress =
    isInstalling && state.contentLength
      ? Math.min(
          100,
          Math.round((state.downloadedBytes / state.contentLength) * 100),
        )
      : null;
  const progressLabel = isInstalling
    ? progress === null
      ? formatBytes(state.downloadedBytes)
      : `${progress}%`
    : null;

  return (
    <Card>
      <Card.Content>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {isInstalling ? (
              <Loader2Icon aria-hidden className="animate-spin" size={16} />
            ) : (
              <DownloadIcon aria-hidden size={16} />
            )}
            <div className="min-w-0">
              <Text weight="bold">Pane {state.version} is available</Text>
              <Text tone="muted">
                {isInstalling ? 'Installing update...' : 'Update when ready.'}
              </Text>
            </div>
          </div>
          <Button disabled={isInstalling} onClick={onInstall}>
            {isInstalling ? (
              <Loader2Icon aria-hidden className="animate-spin" size={16} />
            ) : (
              <DownloadIcon aria-hidden size={16} />
            )}
            {isInstalling ? 'Installing' : 'Update'}
          </Button>
        </div>
        {isInstalling ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${progress ?? 10}%` }}
              />
            </div>
            <div className="w-12 text-right">
              <Text as="span" tone="muted" variant="small">
                {progressLabel}
              </Text>
            </div>
          </div>
        ) : null}
      </Card.Content>
    </Card>
  );
}

function NoticeCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <Card.Content>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {icon}
            <div className="min-w-0">
              <Text weight="bold">{title}</Text>
              <Text tone="muted">{description}</Text>
            </div>
          </div>
          {children}
        </div>
      </Card.Content>
    </Card>
  );
}
