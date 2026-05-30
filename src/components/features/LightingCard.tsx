import { useEffect, useState } from 'react';
import { Cpu, Lightbulb, Monitor, Mouse } from 'lucide-react';
import {
  applyDxLight,
  applyDynamicLighting,
  applyMsiLighting,
  detectDxLight,
  detectMsiLighting,
  dxLightOff,
  getDynamicLightingStatus,
  getLightStates,
  listDynamicLightingDevices,
  restoreAllLights,
  type DynamicLightingDevice,
  type LightState,
} from '../../lib/commands';

type ProbeStatus = 'idle' | 'pass' | 'warn' | 'fail' | 'disabled';

const statusStyles: Record<ProbeStatus, string> = {
  idle: 'bg-neutral-100 text-neutral-600',
  pass: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-800',
  fail: 'bg-rose-100 text-rose-800',
  disabled: 'bg-neutral-200 text-neutral-600',
};

// A "light" is anything we can paint a color onto. We normalize all three
// sources (Windows Dynamic Lighting devices, MSI Mystic Light, DX Light) into
// this discriminated union so the UI can render them with the same row layout.
type Light =
  | { kind: 'dynamic'; id: string; device: DynamicLightingDevice }
  | { kind: 'msi' }
  | { kind: 'dxlight' };

function lightKey(l: Light) {
  return l.kind === 'dynamic' ? `dynamic:${l.id}` : l.kind;
}

function lightTitle(l: Light) {
  switch (l.kind) {
    case 'dynamic':
      return l.device.name;
    case 'msi':
      return 'MSI motherboard';
    case 'dxlight':
      return 'DX Light strip';
  }
}

function lightSubtitle(l: Light) {
  switch (l.kind) {
    case 'dynamic':
      return 'Windows Dynamic Lighting';
    case 'msi':
      return 'Mystic Light ARGB headers';
    case 'dxlight':
      return 'Robobloq monitor bias strip';
  }
}

// Static component (not a value computed during render) so the compiler can
// track it.
function LightIcon({ light }: { light: Light }) {
  switch (light.kind) {
    case 'dynamic':
      return <Mouse size={16} aria-hidden />;
    case 'msi':
      return <Cpu size={16} aria-hidden />;
    case 'dxlight':
      return <Monitor size={16} aria-hidden />;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const stripped = hex.startsWith('#') ? hex.slice(1) : hex;
  if (stripped.length !== 6) return null;
  const r = Number.parseInt(stripped.slice(0, 2), 16);
  const g = Number.parseInt(stripped.slice(2, 4), 16);
  const b = Number.parseInt(stripped.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number) {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

interface Result {
  status: ProbeStatus;
  message: string;
}

interface LightRowProps {
  light: Light;
  initialState?: LightState;
  disabledReason?: string;
}

function LightRow({ light, initialState, disabledReason }: LightRowProps) {
  // Lazy initializers so the persisted state seeds the controls once, on
  // first mount. Subsequent refreshes don't clobber user input.
  const [color, setColor] = useState<string>(() =>
    initialState
      ? rgbToHex(initialState.r, initialState.g, initialState.b)
      : '#ffffff',
  );
  const [brightness, setBrightness] = useState<number>(() => {
    if (!initialState) return 0.75;
    // If the user last turned this off, fall back to a sane default so they
    // can hit Apply without having to also drag the slider up.
    return initialState.on && initialState.brightness > 0
      ? initialState.brightness
      : 0.75;
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>({ status: 'idle', message: '' });
  const disabled = Boolean(disabledReason);
  const visibleStatus = disabled ? 'disabled' : result.status;

  async function apply() {
    if (disabled) return;
    const rgb = hexToRgb(color);
    if (!rgb) {
      setResult({
        status: 'fail',
        message: 'Invalid color (expected #RRGGBB).',
      });
      return;
    }
    setBusy(true);
    try {
      let message = '';
      switch (light.kind) {
        case 'dynamic': {
          const res = await applyDynamicLighting(
            light.id,
            rgb.r,
            rgb.g,
            rgb.b,
            brightness,
          );
          message = res.detail;
          break;
        }
        case 'msi': {
          await applyMsiLighting(rgb.r, rgb.g, rgb.b, brightness);
          message = `MSI: rgb(${rgb.r},${rgb.g},${rgb.b}) at ${Math.round(brightness * 100)}%.`;
          break;
        }
        case 'dxlight': {
          await applyDxLight(rgb.r, rgb.g, rgb.b, brightness);
          message = `DX Light: rgb(${rgb.r},${rgb.g},${rgb.b}) at ${Math.round(brightness * 100)}%.`;
          break;
        }
      }
      setResult({ status: 'pass', message });
    } catch (e) {
      setResult({ status: 'fail', message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (disabled) return;
    setBusy(true);
    try {
      switch (light.kind) {
        case 'dynamic':
          // No dedicated off — paint black at 0% brightness.
          await applyDynamicLighting(light.id, 0, 0, 0, 0);
          break;
        case 'msi':
          await applyMsiLighting(0, 0, 0, 0);
          break;
        case 'dxlight':
          await dxLightOff();
          break;
      }
      setResult({ status: 'pass', message: 'Off.' });
    } catch (e) {
      setResult({ status: 'fail', message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-line rounded-md border p-3">
      <div className="flex items-start gap-3">
        <div className="border-line mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-neutral-50 text-neutral-600">
          <LightIcon light={light} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-sm font-medium">
            {lightTitle(light)}
          </p>
          <p className="truncate text-xs text-neutral-500">
            {lightSubtitle(light)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[visibleStatus]}`}
        >
          {visibleStatus}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_auto_auto]">
        <input
          type="color"
          aria-label={`Color for ${lightTitle(light)}`}
          disabled={disabled}
          className="border-line h-9 w-12 rounded-md border bg-white p-1 disabled:cursor-not-allowed disabled:opacity-50"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-neutral-600">
            Brightness {Math.round(brightness * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            disabled={disabled}
            className="w-full disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>

        <button
          type="button"
          disabled={busy || disabled}
          className="border-line text-ink h-9 rounded-md border bg-white px-3 text-xs font-semibold hover:bg-neutral-50 disabled:opacity-50"
          onClick={() => void apply()}
        >
          Apply
        </button>
        <button
          type="button"
          disabled={busy || disabled}
          className="border-line h-9 rounded-md border bg-white px-3 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          onClick={() => void turnOff()}
        >
          Off
        </button>
      </div>

      {disabledReason && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {disabledReason}
        </p>
      )}

      {result.message && (
        <p
          className={`mt-2 text-[11px] ${result.status === 'fail' ? 'text-rose-600' : 'text-neutral-500'}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}

interface Scan {
  status: ProbeStatus;
  message: string;
  disabledReason: string;
}

export function LightingCard() {
  const [lights, setLights] = useState<Light[]>([]);
  const [savedStates, setSavedStates] = useState<Record<string, LightState>>(
    {},
  );
  const [scan, setScan] = useState<Scan>({
    status: 'idle',
    message: '',
    disabledReason: '',
  });
  // Starts true because we scan for lights on mount.
  const [busy, setBusy] = useState(true);

  // All state updates live in deferred promise callbacks, so this is safe to
  // call straight from an effect without tripping set-state-in-effect.
  function refresh() {
    return Promise.all([
      Promise.all([
        getDynamicLightingStatus(),
        listDynamicLightingDevices().catch(() => []),
      ])
        .then(([status, devices]) => {
          const reason = status.canControl ? '' : (status.reason ?? '');
          setScan((s) => ({ ...s, disabledReason: reason }));
          return devices;
        })
        .catch((e: unknown) => {
          setScan((s) => ({
            ...s,
            disabledReason: '',
            status: 'warn',
            message: String(e),
          }));
          return [];
        }),
      detectMsiLighting().catch(() => ({
        present: false,
        vendorId: 0,
        productId: 0,
      })),
      detectDxLight().catch(() => ({
        present: false,
        vendorId: 0,
        productId: 0,
      })),
      getLightStates().catch(() => ({}) as Record<string, LightState>),
    ])
      .then(([dynamic, msi, dxlight, states]) => {
        const collected: Light[] = [
          ...dynamic.map((d) => ({
            kind: 'dynamic' as const,
            id: d.id,
            device: d,
          })),
          ...(msi.present ? [{ kind: 'msi' as const }] : []),
          ...(dxlight.present ? [{ kind: 'dxlight' as const }] : []),
        ];

        setSavedStates(states);
        setLights(collected);
        setScan((s) => ({
          ...s,
          status: collected.length > 0 ? 'pass' : 'warn',
          message:
            collected.length === 0
              ? 'No controllable lights detected.'
              : `${collected.length} light${collected.length === 1 ? '' : 's'} detected.`,
        }));
      })
      .catch((e: unknown) =>
        setScan((s) => ({ ...s, status: 'fail', message: String(e) })),
      )
      .finally(() => setBusy(false));
  }

  // Entering the loading state from a user action (handler context).
  function beginRefresh() {
    setBusy(true);
    setScan((s) => ({ ...s, status: 'idle' }));
  }

  async function restore() {
    setBusy(true);
    try {
      const results = await restoreAllLights();
      const errors = results.filter(([, err]) => err !== null);
      if (errors.length === 0) {
        setScan((s) => ({
          ...s,
          status: 'pass',
          message: `Restored ${results.length} light${results.length === 1 ? '' : 's'}.`,
        }));
      } else {
        setScan((s) => ({
          ...s,
          status: 'warn',
          message: `Restored ${results.length - errors.length}/${results.length}; failed: ${errors
            .map(([k, e]) => `${k} (${e})`)
            .join(', ')}`,
        }));
      }
    } catch (e) {
      setScan((s) => ({ ...s, status: 'fail', message: String(e) }));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  // Stable key list so React doesn't re-mount rows on every refresh.
  const keyedLights = lights.map((l) => ({ key: lightKey(l), light: l }));

  return (
    <div className="border-line col-span-2 rounded-lg border bg-white/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-ink flex items-center gap-2 text-base font-semibold">
            <Lightbulb size={16} className="text-accent" aria-hidden />
            Lights
          </h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            Per-device color and brightness for Windows Dynamic Lighting, MSI
            Mystic Light, and the DX Light monitor bias strip.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[scan.status]}`}
        >
          {scan.status}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          className="border-line rounded-md border bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          onClick={() => {
            beginRefresh();
            void refresh();
          }}
        >
          Refresh
        </button>
        <button
          type="button"
          disabled={busy || keyedLights.length === 0}
          className="border-line rounded-md border bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          onClick={() => void restore()}
          title="Re-apply the last saved color/brightness to every light"
        >
          Restore
        </button>
        {scan.message && (
          <p
            className={`text-xs ${scan.status === 'fail' ? 'text-rose-600' : 'text-neutral-500'}`}
          >
            {scan.message}
          </p>
        )}
      </div>
      <div className="mt-4 grid gap-3">
        {keyedLights.map(({ key, light }) => (
          <LightRow
            key={key}
            light={light}
            initialState={savedStates[key]}
            disabledReason={
              light.kind === 'dynamic' ? scan.disabledReason : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
