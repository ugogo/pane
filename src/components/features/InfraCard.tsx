import { useEffect, useState } from 'react';
import {
  getRunAtStartup,
  setRunAtStartup,
  type StartupResult,
} from '../../lib/commands';

type ProbeStatus = 'idle' | 'pass' | 'warn' | 'fail';

const statusStyles: Record<ProbeStatus, string> = {
  idle: 'bg-neutral-100 text-neutral-600',
  pass: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-800',
  fail: 'bg-rose-100 text-rose-800',
};

export function InfraCard() {
  const [runAtStartup, setRunAtStartupState] = useState<boolean | null>(null);
  const [startupResult, setStartupResult] = useState<StartupResult | null>(
    null,
  );
  const [startupError, setStartupError] = useState<string>();

  // Read current registry state on mount.
  useEffect(() => {
    void getRunAtStartup()
      .then(setRunAtStartupState)
      .catch((err: unknown) => setStartupError(String(err)));
  }, []);

  async function handleStartupToggle(enabled: boolean) {
    setStartupError(undefined);
    try {
      const result = await setRunAtStartup(enabled);
      setRunAtStartupState(result.enabled);
      setStartupResult(result);
    } catch (err) {
      setStartupError(String(err));
    }
  }

  const startupStatus: ProbeStatus = startupError
    ? 'fail'
    : startupResult
      ? 'pass'
      : 'idle';

  return (
    <div className="border-line rounded-lg border bg-white/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-ink text-base font-semibold">
            Core infrastructure
          </h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            Tray icon, hide-to-tray, single instance, and run-at-startup.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[startupStatus]}`}
        >
          {startupStatus}
        </span>
      </div>

      <div className="space-y-3">
        {/* ── Run at startup ── */}
        <div className="border-line rounded-md border p-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-ink text-sm font-medium">Run at startup</p>
              <p className="text-xs text-neutral-500">
                Writes / removes{' '}
                <code className="rounded bg-neutral-100 px-1">
                  HKCU\…\Run\Pane
                </code>
                {import.meta.env.DEV && (
                  <span className="ml-1 text-amber-600">
                    (disabled in dev — would register the debug binary)
                  </span>
                )}
              </p>
            </div>
            <input
              type="checkbox"
              className="accent-accent h-5 w-5"
              disabled={runAtStartup === null || import.meta.env.DEV}
              checked={runAtStartup ?? false}
              onChange={(e) => void handleStartupToggle(e.target.checked)}
            />
          </div>
          {startupResult && (
            <p className="mt-2 text-xs text-neutral-500">
              {startupResult.detail}
            </p>
          )}
          {startupError && (
            <p className="mt-2 text-xs text-rose-600">{startupError}</p>
          )}
        </div>

        {/* ── Tray + hide-to-tray ── */}
        <div className="border-line rounded-md border p-3">
          <p className="text-ink text-sm font-medium">Hide to tray</p>
          <p className="mt-1 text-xs text-neutral-500">
            Close this window — it should disappear to the system tray without
            exiting. Left-click the tray icon or choose <em>Show Pane</em> to
            restore it.
          </p>
        </div>

        {/* ── Single instance ── */}
        <div className="border-line rounded-md border p-3">
          <p className="text-ink text-sm font-medium">Single instance</p>
          <p className="mt-1 text-xs text-neutral-500">
            Launch a second copy of{' '}
            <code className="rounded bg-neutral-100 px-1">pane.exe</code> while
            this window is open — the second process should exit immediately and
            this window should come to the foreground.
          </p>
        </div>
      </div>
    </div>
  );
}
