import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { HashRouter, Navigate, NavLink, useLocation } from 'react-router';
import { getVersion } from '@tauri-apps/api/app';
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  Languages,
  Lightbulb,
  Loader2,
  Minus,
  Monitor,
  Power,
  RotateCcw,
  Smartphone,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AccentCard } from '@/components/features/AccentCard';
import { BrightnessCard } from '@/components/features/BrightnessCard';
import { CaptureCard } from '@/components/features/CaptureCard';
import { CompanionCard } from '@/components/features/CompanionCard';
import { InfraCard } from '@/components/features/InfraCard';
import { LightingCard } from '@/components/features/LightingCard';
import { MetricsCard } from '@/components/features/MetricsCard';
import { SoundCard } from '@/components/features/SoundCard';
import { Button } from '@/components/ui/button';
import { prepareCaptureWindows } from '@/lib/commands';
import {
  checkForUpdatesOnLaunch,
  installUpdate,
  restartToApplyUpdate,
  type PendingUpdate,
} from '@/lib/updater';

const modules = [
  {
    path: '/capture',
    label: 'Capture',
    title: 'Capture',
    description: 'Fullscreen and area capture with global shortcuts.',
    icon: Camera,
    component: CaptureCard,
  },
  {
    path: '/display',
    label: 'Display',
    title: 'Display',
    description: 'Monitor brightness and presets.',
    icon: Monitor,
    component: BrightnessCard,
  },
  {
    path: '/sound',
    label: 'Sound',
    title: 'Sound',
    description: 'Default devices and volume.',
    icon: Volume2,
    component: SoundCard,
  },
  {
    path: '/lights',
    label: 'Lights',
    title: 'Lights',
    description: 'Supported lighting hardware.',
    icon: Lightbulb,
    component: LightingCard,
  },
  {
    path: '/accent',
    label: 'Accents',
    title: 'Accents',
    description: 'Long-press letters for variants.',
    icon: Languages,
    component: AccentCard,
  },
  {
    path: '/startup',
    label: 'Startup',
    title: 'Startup',
    description: 'Background launch behavior.',
    icon: Power,
    component: InfraCard,
  },
  {
    path: '/companion',
    label: 'Companion',
    title: 'Companion',
    description: 'Control Pane settings from your iPhone.',
    icon: Smartphone,
    component: CompanionCard,
  },
  {
    path: '/diagnostics',
    label: 'Diagnostics',
    title: 'Diagnostics',
    description: 'Memory, startup timing, and process ID.',
    icon: Activity,
    component: MetricsCard,
  },
] satisfies readonly {
  path: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  component: ComponentType<{ className?: string }>;
}[];

type UpdateNoticeState =
  | { status: 'hidden' }
  | { status: 'available'; update: PendingUpdate; version: string }
  | {
      status: 'installing';
      update: PendingUpdate;
      version: string;
      downloadedBytes: number;
      contentLength?: number;
    }
  | { status: 'installed'; version: string }
  | { status: 'error'; message: string };

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function App() {
  const [isBooting, setIsBooting] = useState(true);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateNotice, setUpdateNotice] = useState<UpdateNoticeState>({
    status: 'hidden',
  });

  useEffect(() => {
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    let bootTimer = 0;

    const afterFirstPaint = new Promise<void>((resolve) => {
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => resolve());
      });
    });
    const minimumBoot = new Promise<void>((resolve) => {
      bootTimer = window.setTimeout(resolve, 160);
    });

    const versionTask = getVersion()
      .then(setAppVersion)
      .catch((err) => {
        console.error('Failed to load app version', err);
      });

    void Promise.allSettled([afterFirstPaint, minimumBoot, versionTask]).then(
      () => {
        if (cancelled) return;
        setIsBooting(false);

        void prepareCaptureWindows().catch((err) => {
          console.error('Failed to prepare capture windows', err);
        });
      },
    );

    void checkForUpdatesOnLaunch().then((result) => {
      if (result.status === 'error') {
        setUpdateNotice({ status: 'error', message: result.message });
      } else if (result.status === 'available') {
        setUpdateNotice({
          status: 'available',
          update: result.update,
          version: result.update.version,
        });
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.clearTimeout(bootTimer);
    };
  }, []);

  const handleInstallUpdate = async () => {
    if (updateNotice.status !== 'available') return;

    const { update, version } = updateNotice;
    let downloadedBytes = 0;
    let contentLength: number | undefined;

    setUpdateNotice({
      status: 'installing',
      update,
      version,
      downloadedBytes,
      contentLength,
    });

    const result = await installUpdate(update, (event) => {
      if (event.event === 'Started') {
        contentLength = event.data.contentLength;
        downloadedBytes = 0;
      } else if (event.event === 'Progress') {
        downloadedBytes += event.data.chunkLength;
      }

      setUpdateNotice({
        status: 'installing',
        update,
        version,
        downloadedBytes,
        contentLength,
      });
    });

    if (result.status === 'error') {
      setUpdateNotice({ status: 'error', message: result.message });
      return;
    }

    setUpdateNotice({ status: 'installed', version });
  };

  return (
    <HashRouter>
      {isBooting ? (
        <BootScreen />
      ) : (
        <AppShell
          appVersion={appVersion}
          updateNotice={updateNotice}
          onInstallUpdate={handleInstallUpdate}
        />
      )}
    </HashRouter>
  );
}

function AppShell({
  appVersion,
  updateNotice,
  onInstallUpdate,
}: {
  appVersion: string | null;
  updateNotice: UpdateNoticeState;
  onInstallUpdate: () => void;
}) {
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const matchedModule = modules.find((module) => module.path === pathname);
  const activeModule = matchedModule ?? modules[0];

  useLayoutEffect(() => {
    contentScrollRef.current?.scrollTo({ left: 0, top: 0 });
  }, [pathname]);

  return (
    <main className="text-foreground grid h-screen grid-rows-[36px_minmax(0,1fr)] overflow-hidden bg-transparent">
      <AppTitlebar />

      <div className="grid min-h-0 md:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="app-sidebar px-4 py-5">
          <nav
            aria-label="Pane modules"
            className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible"
          >
            {modules.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  [
                    'flex min-w-max items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors md:min-w-0',
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/62 hover:bg-white/8 hover:text-white',
                  ].join(' ')
                }
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <div
          ref={contentScrollRef}
          className="bg-background min-w-0 overflow-y-auto"
        >
          <header className="bg-background/92 sticky top-0 z-10 border-b px-8 py-5 backdrop-blur">
            <div className="mx-auto flex max-w-[760px] items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {activeModule.title}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {activeModule.description}
                </p>
              </div>
              <p className="bg-card/70 text-muted-foreground rounded-md border px-2 py-1 font-mono text-xs">
                {appVersion ?? 'version unavailable'}
              </p>
            </div>
          </header>

          <div className="mx-auto max-w-[760px] space-y-5 px-8 py-6">
            <UpdateNotice
              state={updateNotice}
              onInstall={onInstallUpdate}
              onRestart={() => void restartToApplyUpdate()}
            />

            {!matchedModule && <Navigate to="/capture" replace />}
            {modules.map(({ path, component: Module }) => {
              const isActive = activeModule.path === path;

              return (
                <section key={path} hidden={!isActive}>
                  <Module />
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}

function BootScreen() {
  return (
    <main className="text-foreground grid h-screen grid-rows-[36px_minmax(0,1fr)] overflow-hidden bg-transparent">
      <AppTitlebar />
      <div className="bg-background grid place-items-center">
        <output aria-label="Loading Pane" className="grid place-items-center">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        </output>
      </div>
    </main>
  );
}

function AppTitlebar() {
  return (
    <div
      className="app-titlebar"
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
        <span className="bg-primary text-primary-foreground flex size-4 items-center justify-center rounded-[4px]">
          <Camera aria-hidden="true" className="size-3" />
        </span>
        <span
          className="truncate text-xs font-medium text-white/86"
          data-tauri-drag-region
        >
          Pane
        </span>
      </div>

      <div className="ml-auto flex h-full">
        <button
          aria-label="Minimize"
          className="app-window-control"
          type="button"
          onClick={() =>
            void getCurrentWindow().minimize().catch(console.error)
          }
        >
          <Minus aria-hidden="true" className="size-3.5" />
        </button>
        <button
          aria-label="Maximize or restore"
          className="app-window-control"
          type="button"
          onClick={() =>
            void getCurrentWindow().toggleMaximize().catch(console.error)
          }
        >
          <Square aria-hidden="true" className="size-3" />
        </button>
        <button
          aria-label="Close to tray"
          className="app-window-control app-window-control-close"
          type="button"
          onClick={() => void getCurrentWindow().hide().catch(console.error)}
        >
          <X aria-hidden="true" className="size-3.5" />
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
      <div className="border-destructive/25 bg-destructive/10 text-destructive flex items-start gap-2 rounded-xl border p-3 text-sm">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Update failed</p>
          <p className="mt-1 break-words">{state.message}</p>
        </div>
      </div>
    );
  }

  if (state.status === 'installed') {
    return (
      <div className="bg-card flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
        <div className="flex min-w-0 items-start gap-2">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">Pane {state.version} is installed</p>
            <p className="text-muted-foreground">Restart when ready.</p>
          </div>
        </div>
        <Button className="shrink-0" size="sm" onClick={onRestart}>
          <RotateCcw aria-hidden="true" />
          Restart
        </Button>
      </div>
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
    <div className="bg-card rounded-xl border p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {isInstalling ? (
            <Loader2
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 animate-spin"
            />
          ) : (
            <Download aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="font-medium">Pane {state.version} is available</p>
            <p className="text-muted-foreground">
              {isInstalling ? 'Installing update...' : 'Update when ready.'}
            </p>
          </div>
        </div>
        <Button
          className="shrink-0"
          disabled={isInstalling}
          size="sm"
          onClick={onInstall}
        >
          {isInstalling ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {isInstalling ? 'Installing' : 'Update'}
        </Button>
      </div>

      {isInstalling ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${progress ?? 10}%` }}
            />
          </div>
          <span className="text-muted-foreground w-12 shrink-0 text-right text-xs">
            {progressLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}
