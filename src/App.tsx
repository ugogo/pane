import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  Square,
  Volume2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AccentCard } from '@/components/features/AccentCard';
import { BrightnessCard } from '@/components/features/BrightnessCard';
import { CaptureCard } from '@/components/features/CaptureCard';
import { InfraCard } from '@/components/features/InfraCard';
import { LightingCard } from '@/components/features/LightingCard';
import { MetricsCard } from '@/components/features/MetricsCard';
import { SoundCard } from '@/components/features/SoundCard';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { prepareCaptureWindows } from '@/lib/commands';
import {
  checkForUpdatesOnLaunch,
  installUpdate,
  restartToApplyUpdate,
  type PendingUpdate,
} from '@/lib/updater';

const modules = [
  { id: 'capture', label: 'Capture', icon: Camera },
  { id: 'display', label: 'Display', icon: Monitor },
  { id: 'sound', label: 'Sound', icon: Volume2 },
  { id: 'lights', label: 'Lights', icon: Lightbulb },
  { id: 'accent', label: 'Accents', icon: Languages },
  { id: 'startup', label: 'Startup', icon: Power },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
] satisfies readonly { id: string; label: string; icon: LucideIcon }[];

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
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateNotice, setUpdateNotice] = useState<UpdateNoticeState>({
    status: 'hidden',
  });

  useLayoutEffect(() => {
    const isOverlayView = new URL(window.location.href).searchParams.has(
      'view',
    );
    if (!isOverlayView) {
      contentScrollRef.current?.scrollTo({ left: 0, top: 0 });
    }
  }, []);

  useEffect(() => {
    const firstFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void prepareCaptureWindows().catch((err) => {
          console.error('Failed to prepare capture windows', err);
        });
      });
    });

    void getVersion()
      .then(setAppVersion)
      .catch((err) => {
        console.error('Failed to load app version', err);
      });

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

    return () => cancelAnimationFrame(firstFrame);
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
    <main className="text-foreground grid h-screen grid-rows-[36px_minmax(0,1fr)] overflow-hidden bg-transparent">
      <AppTitlebar />

      <div className="grid min-h-0 md:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="app-sidebar px-4 py-5">
          <nav
            aria-label="Pane modules"
            className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible"
          >
            {modules.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className="flex min-w-max items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-white/62 transition-colors hover:bg-white/8 hover:text-white md:min-w-0"
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span>{label}</span>
              </a>
            ))}
          </nav>
        </aside>

        <div
          ref={contentScrollRef}
          className="bg-background min-w-0 overflow-y-auto p-8"
        >
          <div className="mx-auto max-w-[760px] space-y-4">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Pane</h1>
                <p className="text-muted-foreground text-sm">
                  Windows utilities in one place.
                </p>
              </div>
              <p className="bg-card/70 text-muted-foreground rounded-md border px-2 py-1 font-mono text-xs">
                {appVersion ?? 'version unavailable'}
              </p>
            </header>

            <UpdateNotice
              state={updateNotice}
              onInstall={handleInstallUpdate}
              onRestart={() => void restartToApplyUpdate()}
            />

            <section id="capture" className="scroll-mt-4">
              <CaptureCard />
            </section>

            <div className="grid gap-4">
              <section id="display" className="scroll-mt-4">
                <BrightnessCard />
              </section>
              <section id="sound" className="scroll-mt-4">
                <SoundCard />
              </section>
              <section id="lights" className="scroll-mt-4">
                <LightingCard />
              </section>
              <section id="accent" className="scroll-mt-4">
                <AccentCard />
              </section>
              <section id="startup" className="scroll-mt-4">
                <InfraCard />
              </section>
            </div>

            <Collapsible defaultOpen={import.meta.env.DEV}>
              <section
                id="diagnostics"
                className="bg-card/85 scroll-mt-4 rounded-xl border"
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium">
                  Diagnostics
                  <span className="text-muted-foreground text-xs">Toggle</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t p-4">
                  <MetricsCard />
                </CollapsibleContent>
              </section>
            </Collapsible>
          </div>
        </div>
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
