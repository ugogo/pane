import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sun, Contrast, Sunset, Trash2, RotateCcw } from '@pane/ui';
import {
  Button,
  Card,
  MutedText,
  PresetGroup,
  PresetIconButton,
  PresetNameButton,
  Slider,
  SliderLabel,
  SliderRow,
  SliderValue,
  Text,
  XStack,
  YStack,
} from '@pane/ui';
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
import { queryKeys } from '@/lib/query-keys';
import type { Status, StatusMessage } from '@/lib/status';
import { useDebouncedWrite } from '@/lib/use-debounced-write';
import { useTauriEvent } from '@/lib/use-tauri-event';
import { PageSpinner } from './page-spinner';
import { StatusText } from './status-ui';

function scanForMonitors(list: MonitorInfo[]): StatusMessage {
  const controllable = list.filter((m) => m.brightness.supported).length;
  if (list.length === 0) {
    return { status: 'warn', message: 'No monitors detected.' };
  }
  if (controllable === 0) {
    return {
      status: 'warn',
      message: `${list.length} monitor${list.length === 1 ? '' : 's'} found, but none expose DDC/CI brightness. Enable DDC/CI in the monitor's on-screen menu.`,
    };
  }
  return {
    status: 'pass',
    message: `${controllable} of ${list.length} monitor${list.length === 1 ? '' : 's'} controllable.`,
  };
}

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

const WARM_GREEN_REDUCTION = 0.35;
const WARM_BLUE_REDUCTION = 0.85;

function gainMax(f: { max: number }) {
  return f.max || 100;
}

function warmthToGains(t: number, m: MonitorInfo) {
  const d = Math.min(Math.max(t, 0), 100) / 100;
  return {
    r: gainMax(m.redGain),
    g: Math.round(gainMax(m.greenGain) * (1 - WARM_GREEN_REDUCTION * d)),
    b: Math.round(gainMax(m.blueGain) * (1 - WARM_BLUE_REDUCTION * d)),
  };
}

function gainsToWarmth(m: MonitorInfo) {
  const b = m.blueGain.value / gainMax(m.blueGain);
  const d = Math.min(Math.max((1 - b) / WARM_BLUE_REDUCTION, 0), 1);
  return Math.round(d * 100);
}

const emptyMonitors: MonitorInfo[] = [];

export function BrightnessCard() {
  const queryClient = useQueryClient();
  const monitorsQuery = useQuery({
    queryKey: queryKeys.displayMonitors,
    queryFn: listMonitors,
  });
  const presetsQuery = useQuery({
    queryKey: queryKeys.displayPresets,
    queryFn: getMonitorPresets,
  });
  const monitors = monitorsQuery.data ?? emptyMonitors;
  const presets = presetsQuery.data ?? [];
  const [scanOverride, setScanOverride] = useState<StatusMessage | null>(null);
  const scan =
    scanOverride ??
    (monitorsQuery.isError
      ? { status: 'fail' as Status, message: String(monitorsQuery.error) }
      : null) ??
    (monitors.length > 0
      ? scanForMonitors(monitors)
      : { status: 'idle' as Status, message: '' });
  const [actionBusy, setActionBusy] = useState(false);
  const schedule = useDebouncedWrite();

  function patchMonitors(updater: (list: MonitorInfo[]) => MonitorInfo[]) {
    queryClient.setQueryData(
      queryKeys.displayMonitors,
      (prev: MonitorInfo[] | undefined) => updater(prev ?? []),
    );
  }

  const busy = actionBusy || monitorsQuery.isFetching;

  async function reloadMonitors(refresh: boolean) {
    setActionBusy(true);
    setScanOverride({ status: 'idle', message: '' });
    try {
      const list = await (refresh ? refreshMonitors() : listMonitors());
      queryClient.setQueryData(queryKeys.displayMonitors, list);
      setScanOverride(null);
    } catch (e) {
      setScanOverride({ status: 'fail', message: String(e) });
    } finally {
      setActionBusy(false);
    }
  }

  useTauriEvent<MonitorInfo[]>('brightness-changed', (event) => {
    const next = event.payload;
    queryClient.setQueryData(
      queryKeys.displayMonitors,
      (prev: MonitorInfo[] | undefined) =>
        (prev ?? []).map((m) => {
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

  function onSlide(id: string, feature: FeatureKey, value: number) {
    patchMonitors((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, [feature]: { ...m[feature], value } } : m,
      ),
    );
    schedule(`${id}:${feature}`, () => {
      void writers[feature](id, value).catch((e) =>
        setScanOverride({ status: 'fail', message: String(e) }),
      );
    });
  }

  function onWarmth(id: string, t: number) {
    const mon = monitors.find((x) => x.id === id);
    if (!mon) return;
    const { r, g, b } = warmthToGains(t, mon);
    patchMonitors((prev) =>
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
    schedule(`${id}:temp`, () => {
      void (async () => {
        try {
          // eslint-disable-next-line react-doctor/async-parallel
          await setMonitorRedGain(id, r);
          await setMonitorGreenGain(id, g);
          await setMonitorBlueGain(id, b);
        } catch (e) {
          setScanOverride({ status: 'fail', message: String(e) });
        }
      })();
    });
  }

  async function onApplyPreset(name: string) {
    setActionBusy(true);
    try {
      const list = await applyMonitorPreset(name);
      queryClient.setQueryData(queryKeys.displayMonitors, list);
      setScanOverride({ status: 'pass', message: `Applied "${name}".` });
    } catch (e) {
      setScanOverride({ status: 'fail', message: String(e) });
    } finally {
      setActionBusy(false);
    }
  }

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
    queryClient.setQueryData(queryKeys.displayPresets, next);
  }

  async function onUpdatePreset(name: string) {
    setActionBusy(true);
    try {
      await snapshot(name);
      setScanOverride({
        status: 'pass',
        message: `Updated "${name}" to current settings.`,
      });
    } catch (e) {
      setScanOverride({ status: 'fail', message: String(e) });
    } finally {
      setActionBusy(false);
    }
  }

  async function onSavePreset() {
    const name = window.prompt('Preset name')?.trim();
    if (!name) return;
    setActionBusy(true);
    try {
      await snapshot(name);
    } catch (e) {
      setScanOverride({ status: 'fail', message: String(e) });
    } finally {
      setActionBusy(false);
    }
  }

  async function onDeletePreset(name: string) {
    setActionBusy(true);
    try {
      const next = await deleteMonitorPreset(name);
      queryClient.setQueryData(queryKeys.displayPresets, next);
    } catch (e) {
      setScanOverride({ status: 'fail', message: String(e) });
    } finally {
      setActionBusy(false);
    }
  }

  if (monitorsQuery.isPending && !monitorsQuery.data) {
    return <PageSpinner />;
  }

  return (
    <YStack gap="$4">
      <PresetBar
        presets={presets}
        busy={busy}
        hasMonitors={monitors.length > 0}
        onRefresh={() => void reloadMonitors(true)}
        onApply={(name) => void onApplyPreset(name)}
        onUpdate={(name) => void onUpdatePreset(name)}
        onDelete={(name) => void onDeletePreset(name)}
        onSave={() => void onSavePreset()}
      />

      {scan.message ? (
        <StatusText status={scan.status}>{scan.message}</StatusText>
      ) : null}

      <YStack gap="$3">
        {monitors.map((m) => (
          <MonitorRow
            key={m.id}
            monitor={m}
            onSlide={onSlide}
            onWarmth={onWarmth}
          />
        ))}
      </YStack>
    </YStack>
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
    <XStack flexWrap="wrap" gap="$2" alignItems="center">
      <Button
        disabled={busy}
        btnScale="sm"
        appearance="outline"
        onPress={onRefresh}
      >
        Refresh
      </Button>

      {presets.map((p) => (
        <PresetGroup key={p.name}>
          <PresetNameButton disabled={busy} onPress={() => onApply(p.name)}>
            {p.name}
          </PresetNameButton>
          <PresetIconButton
            aria-label={`Update ${p.name} preset`}
            disabled={busy || !hasMonitors}
            onPress={() => onUpdate(p.name)}
          >
            <RotateCcw aria-hidden size={12} />
          </PresetIconButton>
          <PresetIconButton
            aria-label={`Delete ${p.name} preset`}
            disabled={busy}
            onPress={() => onDelete(p.name)}
          >
            <Trash2 aria-hidden size={12} />
          </PresetIconButton>
        </PresetGroup>
      ))}

      <Button
        borderColor="$borderColor"
        borderStyle="dashed"
        borderWidth={1}
        disabled={busy || !hasMonitors}
        btnScale="sm"
        appearance="ghost"
        onPress={onSave}
      >
        + Save preset
      </Button>
    </XStack>
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
    <Card gap="$2" padding="$3">
      <Text fontSize="$3" fontWeight="600" numberOfLines={1}>
        {name}
      </Text>

      {sliderMeta.map(({ key, icon: Icon, label }) => {
        const f = m[key];
        return (
          <SliderRow key={key}>
            <SliderLabel>
              <Icon aria-hidden size={12} />
              <MutedText fontSize="$2">{label}</MutedText>
            </SliderLabel>
            {f.supported ? (
              <>
                <Slider
                  max={f.max}
                  min={0}
                  step={1}
                  value={f.value}
                  onChange={(v) => onSlide(m.id, key, v)}
                />
                <SliderValue>{pct(f.value, f.max)}%</SliderValue>
              </>
            ) : (
              <MutedText flex={1} fontSize="$2">
                {label} not supported by this monitor
              </MutedText>
            )}
          </SliderRow>
        );
      })}

      {m.redGain.supported && m.greenGain.supported && m.blueGain.supported ? (
        <SliderRow>
          <SliderLabel>
            <Sunset aria-hidden size={12} />
            <MutedText fontSize="$2">Warmth</MutedText>
          </SliderLabel>
          <Slider
            max={100}
            min={0}
            step={1}
            value={gainsToWarmth(m)}
            onChange={(v) => onWarmth(m.id, v)}
          />
          <SliderValue>
            {gainsToWarmth(m) === 0 ? 'Default' : `${gainsToWarmth(m)}%`}
          </SliderValue>
        </SliderRow>
      ) : null}

      {!m.brightness.supported &&
      !m.contrast.supported &&
      !m.redGain.supported &&
      !m.greenGain.supported &&
      !m.blueGain.supported ? (
        <MutedText
          backgroundColor="$gray3"
          borderColor="$borderColor"
          borderWidth={1}
          fontSize="$2"
          marginTop="$2"
          padding="$3"
          borderRadius="$4"
        >
          DDC/CI unavailable. Enable DDC/CI in this monitor&apos;s on-screen
          menu.
        </MutedText>
      ) : null}
    </Card>
  );
}
