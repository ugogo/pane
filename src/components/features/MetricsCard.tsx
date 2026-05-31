import { useEffect, useEffectEvent, useState } from 'react';
import { getProcessMetrics, type ProcessMetrics } from '../../lib/commands';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtMb(mb: number) {
  return mb < 1 ? `${Math.round(mb * 1024)} KB` : `${mb.toFixed(1)} MB`;
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

// pass < 150 MB · warn 150–300 MB · fail > 300 MB
function ramStatus(mb: number): 'pass' | 'warn' | 'fail' {
  if (mb < 150) return 'pass';
  if (mb < 300) return 'warn';
  return 'fail';
}

const statusStyles = {
  pass: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-800',
  fail: 'bg-rose-100 text-rose-800',
  idle: 'bg-neutral-100 text-neutral-600',
};

// ── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ history }: { history: number[] }) {
  if (history.length < 2) return null;
  const max = Math.max(...history, 1);
  return (
    <div className="flex h-8 items-end gap-px" title="Working set over time">
      {history.map((mb, i) => {
        const pct = Math.max((mb / max) * 100, 4);
        const status = ramStatus(mb);
        const barColor =
          status === 'pass'
            ? 'bg-emerald-400'
            : status === 'warn'
              ? 'bg-amber-400'
              : 'bg-rose-400';
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm opacity-80 ${barColor}`}
            style={{ height: `${pct}%` }}
            title={`${fmtMb(mb)}`}
          />
        );
      })}
    </div>
  );
}

// ── MetricsCard ──────────────────────────────────────────────────────────────

export function MetricsCard() {
  const [metrics, setMetrics] = useState<ProcessMetrics | null>(null);
  const [error, setError] = useState<string>();
  const [autoRefresh, setAutoRefresh] = useState(true);
  // Rolling window of the last 30 working-set samples (MB)
  const [history, setHistory] = useState<number[]>([]);

  // State updates live in the deferred `.then`/`.catch` callbacks, not the
  // synchronous body, so this is safe to call from an effect.
  function refresh() {
    return getProcessMetrics()
      .then((m) => {
        setMetrics(m);
        setError(undefined);
        setHistory((prev) => [...prev.slice(-29), m.workingSetMb]);
      })
      .catch((err: unknown) => setError(String(err)));
  }

  // Effect Event: always sees the latest state, never a dependency.
  const onTick = useEffectEvent(() => void refresh());

  // First fetch on mount, then poll every 2 s while auto-refresh is on.
  useEffect(() => {
    onTick();
    if (!autoRefresh) return;
    const id = setInterval(onTick, 2000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const status = error
    ? 'fail'
    : metrics
      ? ramStatus(metrics.workingSetMb)
      : 'idle';

  return (
    <div className="border-line col-span-2 rounded-lg border bg-white/80 p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-ink text-base font-semibold">Process metrics</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            Live RAM and startup time. Benchmark against the WinUI 3 baseline
            before validating any other checklist item.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[status]}`}
        >
          {status}
        </span>
      </div>

      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : metrics ? (
        <>
          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Working set" value={fmtMb(metrics.workingSetMb)} />
            <Stat label="Virtual mem" value={fmtMb(metrics.virtualMemoryMb)} />
            <Stat
              label="Startup elapsed"
              value={fmtMs(metrics.startupElapsedMs)}
            />
            <Stat label="PID" value={String(metrics.pid)} />
          </div>

          {/* Sparkline */}
          {history.length > 1 && (
            <div className="mt-4">
              <p className="mb-1 text-xs text-neutral-400">
                Working set · last {history.length} samples
              </p>
              <Sparkline history={history} />
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-400">Fetching…</p>
      )}

      {/* Controls */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          className="border-line text-ink rounded-md border bg-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"
          onClick={() => void refresh()}
        >
          Refresh now
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-500">
          <input
            type="checkbox"
            className="accent-accent"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh every 2 s
        </label>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-neutral-50 px-3 py-2">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="text-ink mt-0.5 font-mono text-sm font-semibold">
        {value}
      </div>
    </div>
  );
}
