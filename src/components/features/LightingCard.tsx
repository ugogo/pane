import { useEffect, useState } from 'react';
import { Cpu, Monitor, Mouse } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { StatusBadge, StatusText } from './status-ui';

type ProbeStatus = 'idle' | 'pass' | 'warn' | 'fail' | 'disabled';

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
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <div className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border">
          <LightIcon light={light} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{lightTitle(light)}</p>
          <p className="text-muted-foreground truncate text-xs">
            {lightSubtitle(light)}
          </p>
        </div>
        <StatusBadge status={visibleStatus} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_auto_auto]">
        <input
          type="color"
          aria-label={`Color for ${lightTitle(light)}`}
          disabled={disabled}
          className="bg-background h-9 w-12 rounded-md border p-1 disabled:cursor-not-allowed disabled:opacity-50"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
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

        <Button
          disabled={busy || disabled}
          size="sm"
          onClick={() => void apply()}
        >
          Apply
        </Button>
        <Button
          disabled={busy || disabled}
          size="sm"
          variant="ghost"
          onClick={() => void turnOff()}
        >
          Off
        </Button>
      </div>

      {disabledReason && (
        <p className="bg-muted text-muted-foreground mt-3 rounded-lg border px-3 py-2 text-xs">
          {disabledReason}
        </p>
      )}

      {result.message && (
        <StatusText className="mt-2 text-xs" status={result.status}>
          {result.message}
        </StatusText>
      )}
    </div>
  );
}

interface Scan {
  status: ProbeStatus;
  message: string;
  disabledReason: string;
}

export function LightingCard({ className }: { className?: string }) {
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
    <Card className={className}>
      <CardHeader>
        <CardTitle>Lights</CardTitle>
        <CardDescription>Supported lighting hardware.</CardDescription>
        <CardAction>
          <StatusBadge status={scan.status} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            disabled={busy}
            size="sm"
            onClick={() => {
              beginRefresh();
              void refresh();
            }}
          >
            Refresh
          </Button>
          <Button
            disabled={busy || keyedLights.length === 0}
            size="sm"
            variant="ghost"
            onClick={() => void restore()}
          >
            Restore
          </Button>
        </div>
        {scan.message && (
          <StatusText status={scan.status}>{scan.message}</StatusText>
        )}
        <div className="grid gap-3">
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
      </CardContent>
    </Card>
  );
}
