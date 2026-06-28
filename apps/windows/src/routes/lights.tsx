import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CpuIcon,
  MonitorIcon,
  MouseIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  Button,
  Card,
  ColorPicker,
  Slider,
  Switch,
  Text,
  XStack,
  YStack,
} from 'pickle-ui';
import { PageSpinner } from '@/components/features/page-spinner';
import { StatusBadge, StatusText } from '@/components/features/status-ui';
import {
  ambientSyncStatus,
  applyDxLight,
  applyDynamicLighting,
  applyLightPreset,
  applyMsiLighting,
  deleteLightPreset,
  dxLightOff,
  getAmbientSettings,
  getLightPresets,
  saveAmbientSettings,
  saveLightPreset,
  setAmbientBrightness,
  setAmbientFps,
  setAmbientSaturation,
  setAmbientWarmth,
  setAmbientZones,
  startAmbientSync,
  stopAmbientSync,
  type LightPreset,
  type LightPresetTarget,
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

function sliderValue(value: number | readonly number[], fallback: number) {
  return typeof value === 'number' ? value : (value[0] ?? fallback);
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
      return <MouseIcon size={16} aria-hidden />;
    case 'msi':
      return <CpuIcon size={16} aria-hidden />;
    case 'dxlight':
      return <MonitorIcon size={16} aria-hidden />;
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

function defaultLightState(): LightState {
  return {
    r: 255,
    g: 255,
    b: 255,
    brightness: 0.75,
    on: true,
  };
}

function presetTargetFromState(
  key: string,
  state?: LightState,
): LightPresetTarget {
  const next = state ?? defaultLightState();
  return {
    key,
    r: next.r,
    g: next.g,
    b: next.b,
    brightness: Math.max(0, Math.min(1, next.brightness)),
    on: next.on,
  };
}

function LightRow({
  light,
  initialState,
  disabledReason,
  onApplied,
}: {
  light: Light;
  initialState?: LightState;
  disabledReason?: string;
  onApplied: (state: LightState) => void;
}) {
  const [color, setColor] = useState<string>(() =>
    initialState
      ? rgbToHex(initialState.r, initialState.g, initialState.b)
      : '#ffffff',
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
      onApplied({
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        brightness: b,
        on: b > 0,
      });
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
      const rgb = hexToRgb(color) ?? { r: 0, g: 0, b: 0 };
      onApplied({
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        brightness: 0,
        on: false,
      });
      result.set('pass', 'Off.');
    } catch (e) {
      result.set('fail', String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Card.Content>
        <XStack align="center" gap={3} wrap="wrap">
          <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-muted">
            <LightIcon light={light} />
          </div>
          <div className="min-w-0 flex-1">
            <Text weight="bold" truncate>
              {lightTitle(light)}
            </Text>
            <Text tone="muted" truncate>
              {lightSubtitle(light)}
            </Text>
          </div>
          <StatusBadge status={visibleStatus} />
        </XStack>

        <div className="mt-3">
          <XStack align="center" gap={3} wrap="wrap">
            <ColorPicker
              disabled={disabled}
              value={color}
              onValueChange={setColor}
            >
              <ColorPicker.Trigger
                aria-label={`Color for ${lightTitle(light)}`}
                variant="outline"
                size="sm"
                className="size-8 p-0"
              >
                <ColorPicker.Swatch className="size-full rounded-[calc(var(--radius)-2px)]" />
              </ColorPicker.Trigger>
              <ColorPicker.Content>
                <ColorPicker.Area />
                <ColorPicker.HueSlider />
                <div className="flex items-center gap-2">
                  <ColorPicker.EyeDropper />
                  <ColorPicker.Input />
                </div>
              </ColorPicker.Content>
            </ColorPicker>
            <div className="min-w-40 flex-1">
              <YStack gap={1}>
                <Text tone="muted">Brightness {brightness}%</Text>
                <Slider
                  disabled={disabled}
                  max={100}
                  min={0}
                  step={1}
                  value={[brightness]}
                  onValueChange={(value) =>
                    setBrightness(sliderValue(value, brightness))
                  }
                />
              </YStack>
            </div>
            <Button
              disabled={busy || disabled}
              variant="outline"
              onClick={() => void apply()}
            >
              Apply
            </Button>
            <Button
              disabled={busy || disabled}
              variant="ghost"
              onClick={() => void turnOff()}
            >
              Off
            </Button>
          </XStack>
        </div>

        {disabledReason ? (
          <div className="mt-3 rounded-lg border border-border bg-muted p-3">
            <Text tone="muted">{disabledReason}</Text>
          </div>
        ) : null}

        {result.message ? (
          <StatusText status={result.status}>{result.message}</StatusText>
        ) : null}
      </Card.Content>
    </Card>
  );
}

function AmbientSyncCard() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: queryKeys.ambientSync,
    queryFn: ambientSyncStatus,
    // The loop can stop itself (device unplugged, capture error), so poll
    // while it's meant to be running to keep the toggle honest.
    refetchInterval: (query) => (query.state.data ? 2000 : false),
  });
  const running = statusQuery.data ?? false;
  // Persisted tuning, fetched once to seed the sliders.
  const settingsQuery = useQuery({
    queryKey: queryKeys.ambientSettings,
    queryFn: getAmbientSettings,
  });
  // Slider values, in display units (percentages for brightness/saturation/
  // warmth; counts for zones/fps). Seeded from the persisted settings below.
  const [settings, setSettings] = useState({
    brightness: 60,
    saturation: 150,
    warmth: 150,
    zones: 5,
    fps: 30,
  });
  const { brightness, saturation, warmth, zones, fps } = settings;
  const [busy, setBusy] = useState(false);
  // Config sliders stay tucked away — by default the card is just an on/off switch.
  const [expanded, setExpanded] = useState(false);
  const result = useActionStatus();

  // Seed the sliders from persisted settings once, the first time they arrive.
  const seeded = useRef(false);
  useEffect(() => {
    const data = settingsQuery.data;
    if (!data || seeded.current) return;
    seeded.current = true;
    setSettings({
      brightness: Math.round(data.brightness * 100),
      saturation: Math.round(data.saturation * 100),
      warmth: Math.round(data.warmth * 100),
      zones: data.zones,
      fps: data.fps,
    });
  }, [settingsQuery.data]);

  // Persist tuning, debounced so dragging a slider doesn't hammer the disk.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );
  function persist(next: typeof settings) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveAmbientSettings({
        brightness: next.brightness / 100,
        saturation: next.saturation / 100,
        warmth: next.warmth / 100,
        zones: next.zones,
        fps: next.fps,
      });
    }, 500);
  }

  async function toggle() {
    setBusy(true);
    try {
      if (running) {
        await stopAmbientSync();
        result.set('pass', 'Screen sync off.');
      } else {
        await startAmbientSync(
          brightness / 100,
          saturation / 100,
          warmth / 100,
          zones,
          fps,
        );
        result.set(
          'pass',
          `Syncing the strip to your screen — ${zones} zone${zones === 1 ? '' : 's'} at ${fps} fps.`,
        );
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.ambientSync });
    } catch (e) {
      result.set('fail', String(e));
    } finally {
      setBusy(false);
    }
  }

  // Update one slider, retune a live loop in place (the backend setters no-op
  // when idle), and queue a debounced persist of the new values.
  function change(patch: Partial<typeof settings>, live?: () => void) {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (running) live?.();
    persist(next);
  }

  function onBrightnessChange(next: number) {
    change({ brightness: next }, () => void setAmbientBrightness(next / 100));
  }

  function onSaturationChange(next: number) {
    change({ saturation: next }, () => void setAmbientSaturation(next / 100));
  }

  function onWarmthChange(next: number) {
    change({ warmth: next }, () => void setAmbientWarmth(next / 100));
  }

  function onZonesChange(next: number) {
    change({ zones: next }, () => void setAmbientZones(next));
  }

  function onFpsChange(next: number) {
    change({ fps: next }, () => void setAmbientFps(next));
  }

  return (
    <Card>
      <Card.Content>
        <XStack align="center" gap={3}>
          <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-muted">
            <MonitorIcon size={16} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <Text weight="bold" truncate>
              Screen sync
            </Text>
            <Text tone="muted" truncate>
              DX Light strip follows your screen's color
            </Text>
          </div>
          <Switch
            checked={running}
            disabled={busy}
            label=""
            onCheckedChange={() => void toggle()}
          />
        </XStack>

        <div className="mt-2">
          <Button variant="ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? (
              <ChevronDownIcon aria-hidden size={14} />
            ) : (
              <ChevronRightIcon aria-hidden size={14} />
            )}
            Adjust
          </Button>
        </div>

        {expanded ? (
          <div className="mt-3">
            <XStack align="end" gap={3} wrap="wrap">
              <div className="min-w-40 flex-1">
                <YStack gap={1}>
                  <Text tone="muted">Brightness {brightness}%</Text>
                  <Slider
                    max={100}
                    min={0}
                    step={1}
                    value={[brightness]}
                    onValueChange={(value) =>
                      onBrightnessChange(sliderValue(value, brightness))
                    }
                  />
                </YStack>
              </div>
              <div className="min-w-40 flex-1">
                <YStack gap={1}>
                  <Text tone="muted">Saturation {saturation}%</Text>
                  <Slider
                    max={300}
                    min={100}
                    step={5}
                    value={[saturation]}
                    onValueChange={(value) =>
                      onSaturationChange(sliderValue(value, saturation))
                    }
                  />
                </YStack>
              </div>
              <div className="min-w-40 flex-1">
                <YStack gap={1}>
                  <Text tone="muted">Warmth {warmth}%</Text>
                  <Slider
                    max={200}
                    min={0}
                    step={1}
                    value={[warmth]}
                    onValueChange={(value) =>
                      onWarmthChange(sliderValue(value, warmth))
                    }
                  />
                </YStack>
              </div>
              <div className="min-w-40 flex-1">
                <YStack gap={1}>
                  <Text tone="muted">
                    Zones {zones === 1 ? '1 (single color)' : zones}
                  </Text>
                  <Slider
                    max={10}
                    min={1}
                    step={1}
                    value={[zones]}
                    onValueChange={(value) =>
                      onZonesChange(sliderValue(value, zones))
                    }
                  />
                </YStack>
              </div>
              <div className="min-w-40 flex-1">
                <YStack gap={1}>
                  <Text tone="muted">Frame rate {fps} fps</Text>
                  <Slider
                    max={60}
                    min={5}
                    step={1}
                    value={[fps]}
                    onValueChange={(value) =>
                      onFpsChange(sliderValue(value, fps))
                    }
                  />
                </YStack>
              </div>
            </XStack>
          </div>
        ) : null}

        {result.message ? (
          <StatusText status={result.status}>{result.message}</StatusText>
        ) : null}
      </Card.Content>
    </Card>
  );
}

export const Route = createFileRoute('/lights')({
  component: LightsPage,
});

function LightsPage() {
  const queryClient = useQueryClient();
  const lightsQuery = useQuery({
    queryKey: queryKeys.lights,
    queryFn: fetchLights,
  });
  const presetsQuery = useQuery({
    queryKey: queryKeys.lightPresets,
    queryFn: getLightPresets,
  });
  const [actionMessage, setActionMessage] = useState<{
    status: Status;
    message: string;
    disabledReason?: string;
  } | null>(null);

  const lights = lightsQuery.data?.lights ?? [];
  const savedStates = lightsQuery.data?.savedStates ?? {};
  const presets = presetsQuery.data ?? [];
  const presetsError = presetsQuery.isError
    ? `Could not load presets: ${String(presetsQuery.error)}`
    : '';
  const scan = lightsQuery.data?.scan ?? {
    status: 'idle' as Status,
    message: '',
    disabledReason: '',
  };
  const busy = lightsQuery.isFetching;
  const displayScan =
    actionMessage ??
    (presetsError ? { status: 'warn' as Status, message: presetsError } : scan);
  const dynamicDisabledReason =
    actionMessage?.disabledReason ?? scan.disabledReason;

  const keyedLights = lights.map((l) => ({ key: lightKey(l), light: l }));

  function patchSavedState(key: string, state: LightState) {
    queryClient.setQueryData(
      queryKeys.lights,
      (prev: Awaited<ReturnType<typeof fetchLights>> | undefined) =>
        prev
          ? {
              ...prev,
              savedStates: {
                ...prev.savedStates,
                [key]: state,
              },
            }
          : prev,
    );
  }

  function currentPresetTargets(): LightPresetTarget[] {
    return keyedLights.map(({ key }) =>
      presetTargetFromState(key, savedStates[key]),
    );
  }

  async function snapshot(name: string) {
    const next = await saveLightPreset({
      name,
      targets: currentPresetTargets(),
    });
    queryClient.setQueryData(queryKeys.lightPresets, next);
  }

  async function onApplyPreset(name: string) {
    setActionMessage({ status: 'idle', message: '' });
    try {
      const results = await applyLightPreset(name);
      const errors = results.filter(([, err]) => err !== null);
      if (results.length === 0) {
        setActionMessage({
          status: 'warn',
          message: `Preset "${name}" has no saved lights.`,
        });
      } else if (errors.length === 0) {
        setActionMessage({
          status: 'pass',
          message: `Applied "${name}" to ${results.length} light${results.length === 1 ? '' : 's'}.`,
        });
      } else {
        setActionMessage({
          status: 'warn',
          message: `Applied ${results.length - errors.length}/${results.length}; failed: ${errors
            .map(([key, error]) => `${key} (${error})`)
            .join(', ')}`,
        });
      }
      void lightsQuery.refetch();
    } catch (e) {
      setActionMessage({ status: 'fail', message: String(e) });
    }
  }

  async function onUpdatePreset(name: string) {
    setActionMessage({ status: 'idle', message: '' });
    try {
      await snapshot(name);
      setActionMessage({
        status: 'pass',
        message: `Updated "${name}" to current lights.`,
      });
    } catch (e) {
      setActionMessage({ status: 'fail', message: String(e) });
    }
  }

  async function onSavePreset() {
    const name = window.prompt('Preset name')?.trim();
    if (!name) return;
    setActionMessage({ status: 'idle', message: '' });
    try {
      await snapshot(name);
      setActionMessage({ status: 'pass', message: `Saved "${name}".` });
    } catch (e) {
      setActionMessage({ status: 'fail', message: String(e) });
    }
  }

  async function onDeletePreset(name: string) {
    setActionMessage({ status: 'idle', message: '' });
    try {
      const next = await deleteLightPreset(name);
      queryClient.setQueryData(queryKeys.lightPresets, next);
    } catch (e) {
      setActionMessage({ status: 'fail', message: String(e) });
    }
  }

  if (lightsQuery.isPending && !lightsQuery.data) {
    return <PageSpinner />;
  }

  return (
    <YStack gap={4}>
      <PresetBar
        presets={presets}
        busy={busy || presetsQuery.isFetching}
        hasLights={keyedLights.length > 0}
        onRefresh={() => {
          setActionMessage(null);
          void lightsQuery.refetch();
        }}
        onApply={(name) => void onApplyPreset(name)}
        onUpdate={(name) => void onUpdatePreset(name)}
        onDelete={(name) => void onDeletePreset(name)}
        onSave={() => void onSavePreset()}
      />

      {keyedLights.some(({ light }) => light.kind === 'dxlight') ? (
        <AmbientSyncCard />
      ) : null}

      <YStack gap={3}>
        {keyedLights.map(({ key, light }) => (
          <LightRow
            key={key}
            light={light}
            initialState={savedStates[key]}
            disabledReason={
              light.kind === 'dynamic' ? dynamicDisabledReason : undefined
            }
            onApplied={(state) => patchSavedState(key, state)}
          />
        ))}
      </YStack>
      {displayScan.message ? (
        <StatusText status={displayScan.status}>
          {displayScan.message}
        </StatusText>
      ) : null}
    </YStack>
  );
}

function PresetBar({
  presets,
  busy,
  hasLights,
  onRefresh,
  onApply,
  onUpdate,
  onDelete,
  onSave,
}: {
  presets: LightPreset[];
  busy: boolean;
  hasLights: boolean;
  onRefresh: () => void;
  onApply: (name: string) => void;
  onUpdate: (name: string) => void;
  onDelete: (name: string) => void;
  onSave: () => void;
}) {
  return (
    <XStack align="center" gap={2} wrap="wrap">
      <Button disabled={busy} variant="outline" onClick={onRefresh}>
        Refresh
      </Button>

      {presets.map((preset) => (
        <XStack key={preset.name} gap={0.5}>
          <Button
            disabled={busy || !hasLights}
            variant="secondary"
            onClick={() => onApply(preset.name)}
          >
            {preset.name}
          </Button>
          <Button
            aria-label={`Update ${preset.name} preset`}
            disabled={busy || !hasLights}
            variant="secondary"
            onClick={() => onUpdate(preset.name)}
          >
            <RotateCcwIcon aria-hidden size={12} />
          </Button>
          <Button
            aria-label={`Delete ${preset.name} preset`}
            disabled={busy}
            variant="secondary"
            onClick={() => onDelete(preset.name)}
          >
            <Trash2Icon aria-hidden size={12} />
          </Button>
        </XStack>
      ))}

      <Button disabled={busy || !hasLights} variant="ghost" onClick={onSave}>
        + Save preset
      </Button>
    </XStack>
  );
}
