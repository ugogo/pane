import { MetricsCard } from "./components/features/MetricsCard";

export function App() {
  return (
    <main className="min-h-screen bg-panel">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <header className="mb-6 border-b border-line pb-6">
          <p className="text-sm font-medium text-accent">Tauri feasibility spike</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Home — Phase 1</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Instrumentation first. Confirm RAM and startup time before building anything else.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-4">
          <MetricsCard />
          {/* Additional probe cards will be added in subsequent phases */}
        </div>
      </div>
    </main>
  );
}
