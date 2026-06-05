import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cpu, Monitor, Mouse } from '@pane/ui';
import {
  Button,
  Card,
  DeviceIcon,
  MutedPanel,
  MutedText,
  Slider,
  Text,
  XStack,
  YStack,
  colors,
} from '@pane/ui';
import { PageSpinner } from '@/components/features/page-spinner';
import { StatusBadge, StatusText } from '@/components/features/status-ui';
import {
  applyDxLight,
  applyDynamicLighting,
  applyMsiLighting,
  dxLightOff,
  restoreAllLights,
  type LightState,
} from '@/lib/commands';
import { fetchLights, lightKey, type Light } from '@/lib/lights-query';
import { queryKeys } from '@/lib/query-keys';
import type { Status } from '@/lib/status';
import { useActionStatus } from '@/lib/use-action-status';

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

function LightRow({
  light,
  initialState,
  disabledReason,
}: {
  light: Light;
  initialState?: LightState;
  disabledReason?: string;
}) {
  const [color, setColor] = useState<string>(() =>
    initialState
      ? rgbToHex(initialState.r, initialState.g, initialState.b)
      : colors.white,
  );
  const [brightness, setBrightness] = useState<number>(() => {
    if (!initialState) return 75;
    return initialState.on && initialState.brightness > 0
      ? Math.round(initialState.brightness * 100)
      : 75;
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
      const b = brightness / 100;
      switch (light.kind) {
        case 'dynamic': {
          const res = await applyDynamicLighting(
            light.id,
            rgb.r,
            rgb.g,
            rgb.b,
            b,
          );
          message = res.detail;
          break;
        }
        case 'msi': {
          await applyMsiLighting(rgb.r, rgb.g, rgb.b, b);
          message = `MSI: rgb(${rgb.r},${rgb.g},${rgb.b}) at ${brightness}%.`;
          break;
        }
        case 'dxlight': {
          await applyDxLight(rgb.r, rgb.g, rgb.b, b);
          message = `DX Light: rgb(${rgb.r},${rgb.g},${rgb.b}) at ${brightness}%.`;
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
    <Card gap="$3" padding="$3">
      <XStack flexWrap="wrap" gap="$3" alignItems="center">
        <DeviceIcon>
          <LightIcon light={light} />
        </DeviceIcon>
        <YStack flex={1} style={{ minWidth: 0 }}>
          <Text fontSize="$3" fontWeight="600" numberOfLines={1}>
            {lightTitle(light)}
          </Text>
          <MutedText fontSize="$2" numberOfLines={1}>
            {lightSubtitle(light)}
          </MutedText>
        </YStack>
        <StatusBadge status={visibleStatus} />
      </XStack>

      <XStack flexWrap="wrap" gap="$3" alignItems="center">
        <input
          type="color"
          aria-label={`Color for ${lightTitle(light)}`}
          className="color-input"
          disabled={disabled}
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <YStack flex={1} gap="$1" style={{ minWidth: 160 }}>
          <MutedText fontSize="$2">Brightness {brightness}%</MutedText>
          <Slider
            disabled={disabled}
            max={100}
            min={0}
            step={1}
            value={brightness}
            onChange={setBrightness}
          />
        </YStack>
        <Button
          disabled={busy || disabled}
          btnScale="sm"
          appearance="outline"
          onPress={() => void apply()}
        >
          Apply
        </Button>
        <Button
          disabled={busy || disabled}
          btnScale="xs"
          appearance="ghost"
          onPress={() => void turnOff()}
        >
          Off
        </Button>
      </XStack>

      {disabledReason ? (
        <MutedPanel>
          <MutedText fontSize="$2">{disabledReason}</MutedText>
        </MutedPanel>
      ) : null}

      {result.message ? (
        <StatusText status={result.status}>{result.message}</StatusText>
      ) : null}
    </Card>
  );
}

export default function LightsPage() {
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
    return <PageSpinner />;
  }

  return (
    <YStack gap="$4">
      <XStack gap="$2">
        <Button
          disabled={busy}
          btnScale="sm"
          appearance="outline"
          onPress={() => {
            setActionMessage(null);
            void lightsQuery.refetch();
          }}
        >
          Refresh
        </Button>
        <Button
          disabled={busy || keyedLights.length === 0}
          btnScale="xs"
          appearance="ghost"
          onPress={() => void restore()}
        >
          Restore
        </Button>
      </XStack>
      {displayScan.message ? (
        <StatusText status={displayScan.status}>
          {displayScan.message}
        </StatusText>
      ) : null}
      <YStack gap="$3">
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
      </YStack>
    </YStack>
  );
}
