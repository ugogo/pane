import { useEffect } from "react";
import { CaptureCard } from "./components/features/CaptureCard";
import { InfraCard } from "./components/features/InfraCard";
import { LightingCard } from "./components/features/LightingCard";
import { MetricsCard } from "./components/features/MetricsCard";
import { prepareCaptureWindows } from "./lib/commands";
import { checkForUpdatesOnLaunch } from "./lib/updater";

export function App() {
  useEffect(() => {
    const firstFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void prepareCaptureWindows().catch((err) => {
          console.error("Failed to prepare capture windows", err);
        });
      });
    });

    void checkForUpdatesOnLaunch();

    return () => cancelAnimationFrame(firstFrame);
  }, []);

  return (
    <main className="min-h-screen bg-panel">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <header className="mb-6 border-b border-line pb-6">
          <h1 className="text-2xl font-semibold text-ink">Home</h1>
        </header>

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
