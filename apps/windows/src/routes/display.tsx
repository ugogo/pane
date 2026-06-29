import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  ContrastIcon,
  RotateCcwIcon,
  SunIcon,
  SunsetIcon,
  Trash2Icon,
} from 'lucide-react';
import { Button, Card, Text, XStack, YStack } from 'pickle-ui';
import { PageSpinner } from '@/components/features/page-spinner';
import { LabeledSlider } from '@/components/labeled-slider';
import { PageStatus } from '@/components/page-status';
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
} from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import type { Status, StatusMessage } from '@/lib/status';
import { useDebouncedWrite } from '@/lib/use-debounced-write';
import { useTauriEvent } from '@/lib/use-tauri-event';

function scanForMonitors(list: MonitorInfo[]): StatusMessage {
  const controllable = list.filter((m) => m.brightness.supported).length;
  if (list.length === 0) {
    return { status: 'warn', message: 'No monitors detected.' };
  }
  if (controllable === 0) {
    return {
      status: 'warn',
      message:
        "DDC/CI brightness is unavailable. Enable DDC/CI in the monitor's on-screen menu.",
    };
  }
  return { status: 'pass', message: '' };
}

type FeatureKey = 'brightness' | 'contrast';

const sliderMeta: {
  key: FeatureKey;
  icon: typeof SunIcon;
  label: string;
}[] = [
  { key: 'brightness', icon: SunIcon, label: 'Brightness' },
  { key: 'contrast', icon: ContrastIcon, label: 'Contrast' },
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

// A cold DDC/CI bus NAKs its first reads, so a monitor can return not-yet-ready.
// We re-read on this cadence until it answers, capped so a genuinely unreachable
// monitor doesn't poll forever — past the cap we leave it to a manual Refresh.
const MONITOR_READ_INTERVAL_MS = 700;
const MONITOR_READ_ATTEMPTS = 8;

export const Route = createFileRoute('/display')({
  component: DisplayPage,
});

function DisplayPage() {
  const queryClient = useQueryClient();
  const monitorsQuery = useQuery({
    queryKey: queryKeys.displayMonitors,
    queryFn: listMonitors,
    // A cold DDC/CI bus NAKs its first reads, so a monitor can come back
    // not-yet-ready. Re-read on a short cadence until every monitor answers,
    // capped by read count so a genuinely unreachable one doesn't poll forever.
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      const unready = data.some((m) => !m.ready);
      return unready && query.state.dataUpdateCount < MONITOR_READ_ATTEMPTS
        ? MONITOR_READ_INTERVAL_MS
        : false;
    },
  });
  const presetsQuery = useQuery({
    queryKey: queryKeys.displayPresets,
    queryFn: getMonitorPresets,
  });
  const monitors = monitorsQuery.data ?? emptyMonitors;
  const anyUnready = monitors.some((m) => !m.ready);
  const presets = presetsQuery.data ?? [];
  const presetsError = presetsQuery.isError
    ? `Could not load presets: ${String(presetsQuery.error)}`
    : '';
  const [scanOverride, setScanOverride] = useState<StatusMessage | null>(null);
  const scan =
    scanOverride ??
    (monitorsQuery.isError
      ? { status: 'fail' as Status, message: String(monitorsQuery.error) }
      : null) ??
    (anyUnready
      ? {
          status: 'idle' as Status,
          message: 'Reading display settings over DDC/CI…',
        }
      : null) ??
    (presetsError
      ? { status: 'warn' as Status, message: presetsError }
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
    <YStack gap={4}>
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

      <PageStatus status={scan.status}>{scan.message}</PageStatus>

      <YStack gap={3}>
        {monitors.map((m) =>
          m.ready ? (
            <MonitorRow
              key={m.id}
              monitor={m}
              onSlide={onSlide}
              onWarmth={onWarmth}
            />
          ) : (
            <MonitorPending key={m.id} monitor={m} />
          ),
        )}
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
    <XStack align="center" gap={2} wrap="wrap">
      <Button disabled={busy} variant="outline" onClick={onRefresh}>
        Refresh
      </Button>

      {presets.map((p) => (
        <XStack key={p.name} gap={0.5}>
          <Button
            disabled={busy}
            variant="secondary"
            onClick={() => onApply(p.name)}
          >
            {p.name}
          </Button>
          <Button
            aria-label={`Update ${p.name} preset`}
            disabled={busy || !hasMonitors}
            variant="ghost"
            onClick={() => onUpdate(p.name)}
          >
            <RotateCcwIcon aria-hidden size={12} />
          </Button>
          <Button
            aria-label={`Delete ${p.name} preset`}
            disabled={busy}
            variant="ghost"
            onClick={() => onDelete(p.name)}
          >
            <Trash2Icon aria-hidden size={12} />
          </Button>
        </XStack>
      ))}

      <Button disabled={busy || !hasMonitors} variant="ghost" onClick={onSave}>
        + Save preset
      </Button>
    </XStack>
  );
}

// Shown while a monitor's DDC/CI bus hasn't answered yet. We deliberately
// render no sliders — the feature values aren't trustworthy until `ready`, so
// showing them would be the wrong/default reading we're avoiding. The card
// auto-refreshes until the bus answers (see `refetchInterval`); the Refresh
// hint covers the case where it never does.
function MonitorPending({ monitor }: { monitor: MonitorInfo }) {
  const name = monitor.name || `Monitor ${monitor.id}`;
  return (
    <Card>
      <Card.Content>
        <Text weight="bold" truncate>
          {name}
        </Text>
        <div className="mt-2">
          <Text tone="muted">
            Reading settings over DDC/CI… Press Refresh if this persists.
          </Text>
        </div>
      </Card.Content>
    </Card>
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
    <Card>
      <Card.Content>
        <Text weight="bold" truncate>
          {name}
        </Text>

        {sliderMeta.map(({ key, icon: Icon, label }) => {
          const f = m[key];
          return (
            <div key={key} className="mt-2">
              {f.supported ? (
                <LabeledSlider
                  label={label}
                  leadingIcon={Icon}
                  min={0}
                  max={f.max}
                  step={1}
                  value={f.value}
                  formatValue={(n) => `${pct(n, f.max)}%`}
                  onValueChange={(value) => onSlide(m.id, key, value)}
                />
              ) : (
                <XStack align="center" gap={1}>
                  <Icon aria-hidden size={12} />
                  <Text tone="muted">
                    {label} not supported by this monitor
                  </Text>
                </XStack>
              )}
            </div>
          );
        })}

        {m.redGain.supported &&
        m.greenGain.supported &&
        m.blueGain.supported ? (
          <div className="mt-2">
            <LabeledSlider
              label="Warmth"
              leadingIcon={SunsetIcon}
              min={0}
              max={100}
              step={1}
              value={gainsToWarmth(m)}
              formatValue={(n) => (n === 0 ? 'Default' : `${n}%`)}
              onValueChange={(value) => onWarmth(m.id, value)}
            />
          </div>
        ) : null}

        {!m.brightness.supported &&
        !m.contrast.supported &&
        !m.redGain.supported &&
        !m.greenGain.supported &&
        !m.blueGain.supported ? (
          <div className="mt-2 rounded-lg border border-border bg-muted p-3">
            <Text tone="muted">
              DDC/CI unavailable. Enable DDC/CI in this monitor&apos;s on-screen
              menu.
            </Text>
          </div>
        ) : null}
      </Card.Content>
    </Card>
  );
}
