import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { BrightnessCard } from "./components/features/BrightnessCard";
import { CaptureCard } from "./components/features/CaptureCard";
import { InfraCard } from "./components/features/InfraCard";
import { LightingCard } from "./components/features/LightingCard";
import { MetricsCard } from "./components/features/MetricsCard";
import { prepareCaptureWindows } from "./lib/commands";
import {
  checkForUpdatesOnLaunch,
  installUpdate,
  restartToApplyUpdate,
  type PendingUpdate,
} from "./lib/updater";

type UpdateNoticeState =
  | { status: "hidden" }
  | { status: "available"; update: PendingUpdate; version: string }
  | {
      status: "installing";
      update: PendingUpdate;
      version: string;
      downloadedBytes: number;
      contentLength?: number;
    }
  | { status: "installed"; version: string }
  | { status: "error"; message: string };

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function App() {
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateNotice, setUpdateNotice] = useState<UpdateNoticeState>({
    status: "hidden",
  });

  useEffect(() => {
    const firstFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void prepareCaptureWindows().catch((err) => {
          console.error("Failed to prepare capture windows", err);
        });
      });
    });

    void getVersion()
      .then(setAppVersion)
      .catch((err) => {
        console.error("Failed to load app version", err);
      });

    void checkForUpdatesOnLaunch().then((result) => {
      if (result.status === "error") {
        setUpdateNotice({ status: "error", message: result.message });
      } else if (result.status === "available") {
        setUpdateNotice({
          status: "available",
          update: result.update,
          version: result.update.version,
        });
      }
    });

    return () => cancelAnimationFrame(firstFrame);
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    if (updateNotice.status !== "available") return;

    const { update, version } = updateNotice;
    let downloadedBytes = 0;
    let contentLength: number | undefined;

    setUpdateNotice({
      status: "installing",
      update,
      version,
      downloadedBytes,
      contentLength,
    });

    const result = await installUpdate(update, (event) => {
      if (event.event === "Started") {
        contentLength = event.data.contentLength;
        downloadedBytes = 0;
      } else if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
      }

      setUpdateNotice({
        status: "installing",
        update,
        version,
        downloadedBytes,
        contentLength,
      });
    });

    if (result.status === "error") {
      setUpdateNotice({ status: "error", message: result.message });
      return;
    }

    setUpdateNotice({ status: "installed", version });
  }, [updateNotice]);

  return (
    <main className="min-h-screen bg-panel">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <header className="mb-6 border-b border-line pb-6">
          <h1 className="text-2xl font-semibold text-ink">Pane</h1>
          <p className="mt-1 text-sm text-slate-500">
            Version {appVersion ?? "unavailable"}
          </p>
        </header>

        <UpdateNotice
          state={updateNotice}
          onInstall={handleInstallUpdate}
          onRestart={() => void restartToApplyUpdate()}
        />

        <div className="grid grid-cols-2 gap-4">
          <MetricsCard />
          <CaptureCard />
          <InfraCard />
          <LightingCard />
          <BrightnessCard />
        </div>
      </div>
    </main>
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
  if (state.status === "hidden") return null;

  if (state.status === "error") {
    return (
      <div
        className="mb-4 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        role="alert"
      >
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
        />
        <div>
          <p className="font-medium">Update failed</p>
          <p className="mt-1 break-words text-red-800">{state.message}</p>
        </div>
      </div>
    );
  }

  if (state.status === "installed") {
    return (
      <div className="mb-4 flex items-center justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <div className="flex min-w-0 items-start gap-3">
          <CheckCircle2
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
          />
          <div className="min-w-0">
            <p className="font-medium">Pane {state.version} is installed</p>
            <p className="mt-1 text-emerald-800">Restart when you are ready.</p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-950 hover:bg-emerald-100"
          onClick={onRestart}
        >
          <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
          Restart
        </button>
      </div>
    );
  }

  const isInstalling = state.status === "installing";
  const progress =
    isInstalling && state.contentLength
      ? Math.min(100, Math.round((state.downloadedBytes / state.contentLength) * 100))
      : null;
  const progressLabel = isInstalling
    ? progress === null
      ? formatBytes(state.downloadedBytes)
      : `${progress}%`
    : null;

  return (
    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {isInstalling ? (
            <Loader2
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-700"
            />
          ) : (
            <Download
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
            />
          )}
          <div className="min-w-0">
            <p className="font-medium">Pane {state.version} is available</p>
            <p className="mt-1 text-amber-800">
              {isInstalling ? "Installing update..." : "Update when you are ready."}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isInstalling}
          onClick={onInstall}
        >
          {isInstalling ? (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {isInstalling ? "Installing" : "Update"}
        </button>
      </div>

      {isInstalling ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-100">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${progress ?? 10}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-xs font-medium text-amber-800">
            {progressLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}
