import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cpu, Monitor, Mouse } from 'lucide-react';
import {
  applyDxLight,
  applyDynamicLighting,
  applyMsiLighting,
  dxLightOff,
  restoreAllLights,
  type LightState,
} from '../../lib/commands';
import { fetchLights, lightKey, type Light } from '@/lib/lights-query';
import { queryKeys } from '@/lib/query-keys';
import type { Status } from '@/lib/status';
import { useActionStatus } from '@/lib/use-action-status';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { PageSpinner } from './page-spinner';
import { StatusBadge, StatusText } from './status-ui';

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
  const result = useActionStatus();
  const disabled = Boolean(disabledReason);
  const visibleStatus = disabled ? 'disabled' : result.status;

  async function apply() {
    if (disabled) return;
    const rgb = hexToRgb(color);
    if (!rgb) {
      result.set('fail', 'Invalid color (expected #RRGGBB).');
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
      result.set('pass', message);
    } catch (e) {
      result.set('fail', String(e));
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
      result.set('pass', 'Off.');
    } catch (e) {
      result.set('fail', String(e));
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
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            disabled={disabled}
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

export function LightingCard({ className }: { className?: string }) {
  const lightsQuery = useQuery({
    queryKey: queryKeys.lights,
    queryFn: fetchLights,
  });
  const [actionMessage, setActionMessage] = useState<{
    status: Status;
    message: string;
    disabledReason?: string;
  } | null>(null);

  const lights = lightsQuery.data?.lights ?? [];
  const savedStates = lightsQuery.data?.savedStates ?? {};
  const scan = lightsQuery.data?.scan ?? {
    status: 'idle' as Status,
    message: '',
    disabledReason: '',
  };
  const busy = lightsQuery.isFetching;
  const displayScan = actionMessage ?? scan;
  const dynamicDisabledReason =
    actionMessage?.disabledReason ?? scan.disabledReason;

  async function restore() {
    setActionMessage({ status: 'idle', message: '' });
    try {
      const results = await restoreAllLights();
      const errors = results.filter(([, err]) => err !== null);
      if (errors.length === 0) {
        setActionMessage({
          status: 'pass',
          message: `Restored ${results.length} light${results.length === 1 ? '' : 's'}.`,
        });
      } else {
        setActionMessage({
          status: 'warn',
          message: `Restored ${results.length - errors.length}/${results.length}; failed: ${errors
            .map(([k, e]) => `${k} (${e})`)
            .join(', ')}`,
        });
      }
      void lightsQuery.refetch();
    } catch (e) {
      setActionMessage({ status: 'fail', message: String(e) });
    }
  }

  const keyedLights = lights.map((l) => ({ key: lightKey(l), light: l }));

  if (lightsQuery.isPending && !lightsQuery.data) {
    return <PageSpinner className={className} />;
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2">
        <Button
          disabled={busy}
          size="sm"
          onClick={() => {
            setActionMessage(null);
            void lightsQuery.refetch();
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
      {displayScan.message && (
        <StatusText status={displayScan.status}>
          {displayScan.message}
        </StatusText>
      )}
      <div className="grid gap-3">
        {keyedLights.map(({ key, light }) => (
          <LightRow
            key={key}
            light={light}
            initialState={savedStates[key]}
            disabledReason={
              light.kind === 'dynamic' ? dynamicDisabledReason : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
