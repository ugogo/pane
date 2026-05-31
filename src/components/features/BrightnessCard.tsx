import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Sun, Contrast, Sunset, Trash2, RotateCcw } from 'lucide-react';
import {
  listMonitors,
  refreshMonitors,
  setMonitorBrightness,
  setMonitorContrast,
  setMonitorRedGain,
  setMonitorGreenGain,
  setMonitorBlueGain,
  getMonitorPresets,
  saveMonitorPreset,
  deleteMonitorPreset,
  applyMonitorPreset,
  type MonitorInfo,
  type MonitorPreset,
} from '../../lib/commands';

type ScanStatus = 'idle' | 'pass' | 'warn' | 'fail';

interface Scan {
  status: ScanStatus;
  message: string;
}

const statusStyles: Record<ScanStatus, string> = {
  idle: 'bg-neutral-100 text-neutral-600',
  pass: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-800',
  fail: 'bg-rose-100 text-rose-800',
};

// DDC/CI writes are slow (tens of ms over I2C), so we only push to the monitor
// after the slider settles rather than on every pixel of drag.
const WRITE_DEBOUNCE_MS = 150;

type FeatureKey = 'brightness' | 'contrast';

const sliderMeta: { key: FeatureKey; icon: typeof Sun; label: string }[] = [
  { key: 'brightness', icon: Sun, label: 'Brightness' },
  { key: 'contrast', icon: Contrast, label: 'Contrast' },
];

const writers: Record<
  FeatureKey,
  (id: string, value: number) => Promise<void>
> = {
  brightness: setMonitorBrightness,
  contrast: setMonitorContrast,
};

function pct(value: number, max: number) {
  return max > 0 ? Math.round((value / max) * 100) : 0;
}

// Warm-only white balance via the R/G/B gains: 0 = default (native white, all
// gains at max), 100 = strongest warmth (deep iPhone-Night-Shift amber). Red is
// held high; green is eased down a little and blue is pulled way down so the
// white point drifts to amber rather than just dim yellow.
const WARM_GREEN_REDUCTION = 0.35; // green floors at 65% of range
const WARM_BLUE_REDUCTION = 0.85; // blue floors at 15% of range

function gainMax(f: { max: number }) {
  return f.max || 100;
}

/** Slider position (0–100) → absolute R/G/B gain values. */
function warmthToGains(t: number, m: MonitorInfo) {
  const d = Math.min(Math.max(t, 0), 100) / 100;
  return {
    r: gainMax(m.redGain),
    g: Math.round(gainMax(m.greenGain) * (1 - WARM_GREEN_REDUCTION * d)),
    b: Math.round(gainMax(m.blueGain) * (1 - WARM_BLUE_REDUCTION * d)),
  };
}

/** Current white point → slider position, so the slider opens where the monitor is. */
function gainsToWarmth(m: MonitorInfo) {
  const b = m.blueGain.value / gainMax(m.blueGain);
  const d = Math.min(Math.max((1 - b) / WARM_BLUE_REDUCTION, 0), 1);
  return Math.round(d * 100);
}

export function BrightnessCard() {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [presets, setPresets] = useState<MonitorPreset[]>([]);
  const [scan, setScan] = useState<Scan>({ status: 'idle', message: '' });
  // Starts true because we enumerate monitors on mount.
  const [busy, setBusy] = useState(true);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // All state updates live in deferred promise callbacks, so this is safe to
  // call straight from an effect without tripping set-state-in-effect.
  function load(refresh: boolean) {
    return (refresh ? refreshMonitors() : listMonitors())
      .then((list) => {
        setMonitors(list);
        const controllable = list.filter((m) => m.brightness.supported).length;
        if (list.length === 0) {
          setScan({ status: 'warn', message: 'No monitors detected.' });
        } else if (controllable === 0) {
          setScan({
            status: 'warn',
            message: `${list.length} monitor${list.length === 1 ? '' : 's'} found, but none expose DDC/CI brightness. Enable DDC/CI in the monitor's on-screen menu.`,
          });
        } else {
          setScan({
            status: 'pass',
            message: `${controllable} of ${list.length} monitor${list.length === 1 ? '' : 's'} controllable.`,
          });
        }
      })
      .catch((e: unknown) => setScan({ status: 'fail', message: String(e) }))
      .finally(() => setBusy(false));
  }

  // Entering the loading state from a user action (handler context).
  function beginLoad() {
    setBusy(true);
    setScan({ status: 'idle', message: '' });
  }

  useEffect(() => {
    void load(false);
    void getMonitorPresets()
      .then(setPresets)
      .catch(() => {});
  }, []);

  // The physical brightness key adjusts every monitor in the Rust backend and
  // emits the new values; reflect them so the sliders track the key live.
  useEffect(() => {
    const unlisten = listen<MonitorInfo[]>('brightness-changed', (event) => {
      const next = event.payload;
      setMonitors((prev) =>
        prev.map((m) => {
          const updated = next.find((n) => n.id === m.id);
          return updated
            ? {
                ...m,
                brightness: {
                  ...m.brightness,
                  value: updated.brightness.value,
                },
              }
            : m;
        }),
      );
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  function onSlide(id: string, feature: FeatureKey, value: number) {
    setMonitors((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, [feature]: { ...m[feature], value } } : m,
      ),
    );
    const timerKey = `${id}:${feature}`;
    if (timers.current[timerKey]) clearTimeout(timers.current[timerKey]);
    timers.current[timerKey] = setTimeout(() => {
      void writers[feature](id, value).catch((e) =>
        setScan({ status: 'fail', message: String(e) }),
      );
    }, WRITE_DEBOUNCE_MS);
  }

  function onWarmth(id: string, t: number) {
    const mon = monitors.find((x) => x.id === id);
    if (!mon) return;
    const { r, g, b } = warmthToGains(t, mon);
    setMonitors((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              redGain: { ...m.redGain, value: r },
              greenGain: { ...m.greenGain, value: g },
              blueGain: { ...m.blueGain, value: b },
            }
          : m,
      ),
    );
    const timerKey = `${id}:temp`;
    if (timers.current[timerKey]) clearTimeout(timers.current[timerKey]);
    timers.current[timerKey] = setTimeout(() => {
      void (async () => {
        try {
          // DDC writes must be sequential — concurrent I2C writes to one
          // monitor race, so Promise.all() here would corrupt the white point.
          // eslint-disable-next-line react-doctor/async-parallel
          await setMonitorRedGain(id, r);
          await setMonitorGreenGain(id, g);
          await setMonitorBlueGain(id, b);
        } catch (e) {
          setScan({ status: 'fail', message: String(e) });
        }
      })();
    }, WRITE_DEBOUNCE_MS);
  }

  async function onApplyPreset(name: string) {
    setBusy(true);
    try {
      const list = await applyMonitorPreset(name);
      setMonitors(list);
      setScan({ status: 'pass', message: `Applied "${name}".` });
    } catch (e) {
      setScan({ status: 'fail', message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  // Snapshot the current settings (first controllable monitor's percentages)
  // into a named preset.
  async function snapshot(name: string) {
    const ref = monitors.find((m) => m.brightness.supported) ?? monitors[0];
    if (!ref) return;
    const next = await saveMonitorPreset({
      name,
      brightnessPct: pct(ref.brightness.value, ref.brightness.max),
      contrastPct: pct(ref.contrast.value, ref.contrast.max),
      redGainPct: pct(ref.redGain.value, ref.redGain.max),
      greenGainPct: pct(ref.greenGain.value, ref.greenGain.max),
      blueGainPct: pct(ref.blueGain.value, ref.blueGain.max),
    });
    setPresets(next);
  }

  async function onUpdatePreset(name: string) {
    setBusy(true);
    try {
      await snapshot(name);
      setScan({
        status: 'pass',
        message: `Updated "${name}" to current settings.`,
      });
    } catch (e) {
      setScan({ status: 'fail', message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onSavePreset() {
    const name = window.prompt('Preset name')?.trim();
    if (!name) return;
    setBusy(true);
    try {
      await snapshot(name);
    } catch (e) {
      setScan({ status: 'fail', message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onDeletePreset(name: string) {
    setBusy(true);
    try {
      const next = await deleteMonitorPreset(name);
      setPresets(next);
    } catch (e) {
      setScan({ status: 'fail', message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-line col-span-2 rounded-lg border bg-white/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-ink flex items-center gap-2 text-base font-semibold">
            <Sun size={16} className="text-accent" aria-hidden />
            Display
          </h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            Per-monitor brightness, contrast and warmth over DDC/CI. The
            Keychron brightness keys drive the sliders too.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[scan.status]}`}
        >
          {scan.status}
        </span>
      </div>

      <PresetBar
        presets={presets}
        busy={busy}
        hasMonitors={monitors.length > 0}
        onRefresh={() => {
          beginLoad();
          void load(true);
        }}
        onApply={(name) => void onApplyPreset(name)}
        onUpdate={(name) => void onUpdatePreset(name)}
        onDelete={(name) => void onDeletePreset(name)}
        onSave={() => void onSavePreset()}
      />

      {scan.message && (
        <p
          className={`mt-2 text-xs ${scan.status === 'fail' ? 'text-rose-600' : 'text-neutral-500'}`}
        >
          {scan.message}
        </p>
      )}

      <div className="mt-4 grid gap-3">
        {monitors.map((m) => (
          <MonitorRow
            key={m.id}
            monitor={m}
            onSlide={onSlide}
            onWarmth={onWarmth}
          />
        ))}
      </div>
    </div>
  );
}

function PresetBar({
  presets,
  busy,
  hasMonitors,
  onRefresh,
  onApply,
  onUpdate,
  onDelete,
  onSave,
}: {
  presets: MonitorPreset[];
  busy: boolean;
  hasMonitors: boolean;
  onRefresh: () => void;
  onApply: (name: string) => void;
  onUpdate: (name: string) => void;
  onDelete: (name: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className="border-line rounded-md border bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
        onClick={onRefresh}
        title="Re-enumerate monitors (after plugging/unplugging)"
      >
        Refresh
      </button>

      {presets.map((p) => (
        <span
          key={p.name}
          className="border-line inline-flex items-center overflow-hidden rounded-md border"
        >
          <button
            type="button"
            disabled={busy}
            className="bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            onClick={() => onApply(p.name)}
            title={`Apply — brightness ${p.brightnessPct}%, contrast ${p.contrastPct}%, white balance R${p.redGainPct}/G${p.greenGainPct}/B${p.blueGainPct}`}
          >
            {p.name}
          </button>
          <button
            type="button"
            disabled={busy || !hasMonitors}
            className="border-line border-l bg-white px-1.5 py-1 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700 disabled:opacity-50"
            onClick={() => onUpdate(p.name)}
            aria-label={`Update preset ${p.name} to current settings`}
            title={`Update "${p.name}" to current settings`}
          >
            <RotateCcw size={12} aria-hidden />
          </button>
          <button
            type="button"
            disabled={busy}
            className="border-line border-l bg-white px-1.5 py-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            onClick={() => onDelete(p.name)}
            aria-label={`Delete preset ${p.name}`}
            title={`Delete "${p.name}"`}
          >
            <Trash2 size={12} aria-hidden />
          </button>
        </span>
      ))}

      <button
        type="button"
        disabled={busy || !hasMonitors}
        className="border-line rounded-md border border-dashed bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
        onClick={onSave}
        title="Save the current settings as a new preset"
      >
        + Save preset
      </button>
    </div>
  );
}

function MonitorRow({
  monitor: m,
  onSlide,
  onWarmth,
}: {
  monitor: MonitorInfo;
  onSlide: (id: string, feature: FeatureKey, value: number) => void;
  onWarmth: (id: string, t: number) => void;
}) {
  const name = m.name || `Monitor ${m.id}`;
  return (
    <div className="border-line rounded-md border p-3">
      <p className="text-ink truncate text-sm font-medium">{name}</p>

      {sliderMeta.map(({ key, icon: Icon, label }) => {
        const f = m[key];
        return (
          <div key={key} className="mt-2 flex items-center gap-3">
            <Icon size={14} className="shrink-0 text-neutral-400" aria-hidden />
            {f.supported ? (
              <>
                <input
                  type="range"
                  min={0}
                  max={f.max}
                  step={1}
                  value={f.value}
                  onChange={(e) => onSlide(m.id, key, Number(e.target.value))}
                  aria-label={`${label} for ${name}`}
                  className="w-full"
                />
                <span className="w-10 shrink-0 text-right text-xs font-semibold text-neutral-500">
                  {pct(f.value, f.max)}%
                </span>
              </>
            ) : (
              <span className="flex-1 text-xs text-neutral-400 italic">
                {label} not supported by this monitor
              </span>
            )}
          </div>
        );
      })}

      {m.redGain.supported && m.greenGain.supported && m.blueGain.supported && (
        <div className="mt-2 flex items-center gap-3">
          <Sunset size={14} className="shrink-0 text-neutral-400" aria-hidden />
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={gainsToWarmth(m)}
            onChange={(e) => onWarmth(m.id, Number(e.target.value))}
            aria-label={`Warmth for ${name}`}
            title="Default (left) → warmer (right)"
            className="w-full"
          />
          <span className="w-20 shrink-0 text-right text-xs font-semibold text-neutral-500">
            {gainsToWarmth(m) === 0 ? 'Default' : `Warm ${gainsToWarmth(m)}%`}
          </span>
        </div>
      )}

      {!m.brightness.supported &&
        !m.contrast.supported &&
        !m.redGain.supported &&
        !m.greenGain.supported &&
        !m.blueGain.supported && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            DDC/CI unavailable. Enable DDC/CI in this monitor's on-screen menu.
          </p>
        )}
    </div>
  );
}
