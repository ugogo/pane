import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { AlertTriangle } from "lucide-react";
import { CaptureCard } from "./components/features/CaptureCard";
import { InfraCard } from "./components/features/InfraCard";
import { LightingCard } from "./components/features/LightingCard";
import { MetricsCard } from "./components/features/MetricsCard";
import { prepareCaptureWindows } from "./lib/commands";
import { checkForUpdatesOnLaunch } from "./lib/updater";

export function App() {
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

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
        setUpdateError(result.message);
      }
    });

    return () => cancelAnimationFrame(firstFrame);
  }, []);

  return (
    <main className="min-h-screen bg-panel">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <header className="mb-6 border-b border-line pb-6">
          <h1 className="text-2xl font-semibold text-ink">Pane</h1>
          <p className="mt-1 text-sm text-slate-500">
            Version {appVersion ?? "unavailable"}
          </p>
        </header>

        {updateError ? (
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
              <p className="mt-1 break-words text-red-800">{updateError}</p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <MetricsCard />
          <CaptureCard />
          <InfraCard />
          <LightingCard />
        </div>
      </div>
    </main>
  );
}
