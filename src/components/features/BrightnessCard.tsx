import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  Button,
  Slider,
  Body1,
  Caption1,
  Tooltip,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  BrightnessHighRegular,
  CircleHalfFillRegular,
  TemperatureRegular,
  DeleteRegular,
  ArrowResetRegular,
  AddRegular,
  type FluentIcon,
} from '@fluentui/react-icons';
import { FeatureCard } from '../FeatureCard';
import type { ProbeStatus } from '../../lib/status';
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

interface Scan {
  status: ProbeStatus;
  message: string;
}

// DDC/CI writes are slow (tens of ms over I2C), so we only push to the monitor
// after the slider settles rather than on every pixel of drag.
const WRITE_DEBOUNCE_MS = 150;

type FeatureKey = 'brightness' | 'contrast';

const sliderMeta: { key: FeatureKey; icon: FluentIcon; label: string }[] = [
  { key: 'brightness', icon: BrightnessHighRegular, label: 'Brightness' },
  { key: 'contrast', icon: CircleHalfFillRegular, label: 'Contrast' },
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

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: '12px' },
  presetBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
  },
  presetGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    padding: '2px',
  },
  message: { color: tokens.colorNeutralForeground3 },
  error: { color: tokens.colorPaletteRedForeground1 },
  monitor: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px',
  },
  sliderRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  sliderIcon: { flexShrink: 0, color: tokens.colorNeutralForeground3 },
  slider: { flexGrow: 1 },
  sliderPct: {
    minWidth: '44px',
    textAlign: 'right',
    color: tokens.colorNeutralForeground3,
  },
  warmthPct: { minWidth: '84px' },
  unsupported: {
    flexGrow: 1,
    fontStyle: 'italic',
    color: tokens.colorNeutralForeground3,
  },
  note: {
    color: tokens.colorStatusWarningForeground1,
    backgroundColor: tokens.colorStatusWarningBackground1,
    borderRadius: tokens.borderRadiusMedium,
    paddingTop: '6px',
    paddingBottom: '6px',
    paddingLeft: '10px',
    paddingRight: '10px',
  },
});

type Styles = ReturnType<typeof useStyles>;

export function BrightnessCard() {
  const styles = useStyles();
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
    <FeatureCard
      wide
      title="Display"
      description="Per-monitor brightness, contrast and warmth over DDC/CI. The Keychron brightness keys drive the sliders too."
      icon={<BrightnessHighRegular />}
      status={scan.status}
    >
      <div className={styles.body}>
        <PresetBar
          presets={presets}
          busy={busy}
          hasMonitors={monitors.length > 0}
          styles={styles}
          onRefresh={() => {
            beginLoad();
            void load(true);
          }}
          onApply={(name) => void onApplyPreset(name)}
          onUpdate={(name) => void onUpdatePreset(name)}
          onDelete={(name) => void onDeletePreset(name)}
          onSave={() => void onSavePreset()}
        />

        {scan.message ? (
          <Caption1
            className={scan.status === 'fail' ? styles.error : styles.message}
          >
            {scan.message}
          </Caption1>
        ) : null}

        {monitors.map((m) => (
          <MonitorRow
            key={m.id}
            monitor={m}
            onSlide={onSlide}
            onWarmth={onWarmth}
            styles={styles}
          />
        ))}
      </div>
    </FeatureCard>
  );
}

function PresetBar({
  presets,
  busy,
  hasMonitors,
  styles,
  onRefresh,
  onApply,
  onUpdate,
  onDelete,
  onSave,
}: {
  presets: MonitorPreset[];
  busy: boolean;
  hasMonitors: boolean;
  styles: Styles;
  onRefresh: () => void;
  onApply: (name: string) => void;
  onUpdate: (name: string) => void;
  onDelete: (name: string) => void;
  onSave: () => void;
}) {
  return (
    <div className={styles.presetBar}>
      <Button
        size="small"
        disabled={busy}
        onClick={onRefresh}
        title="Re-enumerate monitors (after plugging/unplugging)"
      >
        Refresh
      </Button>

      {presets.map((p) => (
        <span key={p.name} className={styles.presetGroup}>
          <Button
            size="small"
            appearance="subtle"
            disabled={busy}
            onClick={() => onApply(p.name)}
            title={`Apply — brightness ${p.brightnessPct}%, contrast ${p.contrastPct}%, white balance R${p.redGainPct}/G${p.greenGainPct}/B${p.blueGainPct}`}
          >
            {p.name}
          </Button>
          <Tooltip
            content={`Update "${p.name}" to current settings`}
            relationship="label"
          >
            <Button
              size="small"
              appearance="subtle"
              icon={<ArrowResetRegular />}
              disabled={busy || !hasMonitors}
              aria-label={`Update preset ${p.name} to current settings`}
              onClick={() => onUpdate(p.name)}
            />
          </Tooltip>
          <Tooltip content={`Delete "${p.name}"`} relationship="label">
            <Button
              size="small"
              appearance="subtle"
              icon={<DeleteRegular />}
              disabled={busy}
              aria-label={`Delete preset ${p.name}`}
              onClick={() => onDelete(p.name)}
            />
          </Tooltip>
        </span>
      ))}

      <Button
        size="small"
        appearance="subtle"
        icon={<AddRegular />}
        disabled={busy || !hasMonitors}
        onClick={onSave}
        title="Save the current settings as a new preset"
      >
        Save preset
      </Button>
    </div>
  );
}

function MonitorRow({
  monitor: m,
  onSlide,
  onWarmth,
  styles,
}: {
  monitor: MonitorInfo;
  onSlide: (id: string, feature: FeatureKey, value: number) => void;
  onWarmth: (id: string, t: number) => void;
  styles: Styles;
}) {
  const name = m.name || `Monitor ${m.id}`;
  const warmth = gainsToWarmth(m);
  return (
    <div className={styles.monitor}>
      <Body1>{name}</Body1>

      {sliderMeta.map(({ key, icon: Icon, label }) => {
        const f = m[key];
        return (
          <div key={key} className={styles.sliderRow}>
            <Icon className={styles.sliderIcon} fontSize={16} aria-hidden />
            {f.supported ? (
              <>
                <Slider
                  className={styles.slider}
                  min={0}
                  max={f.max}
                  value={f.value}
                  onChange={(_, data) => onSlide(m.id, key, data.value)}
                  aria-label={`${label} for ${name}`}
                />
                <Caption1 className={styles.sliderPct}>
                  {pct(f.value, f.max)}%
                </Caption1>
              </>
            ) : (
              <Caption1 className={styles.unsupported}>
                {label} not supported by this monitor
              </Caption1>
            )}
          </div>
        );
      })}

      {m.redGain.supported && m.greenGain.supported && m.blueGain.supported ? (
        <div className={styles.sliderRow}>
          <TemperatureRegular
            className={styles.sliderIcon}
            fontSize={16}
            aria-hidden
          />
          <Slider
            className={styles.slider}
            min={0}
            max={100}
            value={warmth}
            onChange={(_, data) => onWarmth(m.id, data.value)}
            aria-label={`Warmth for ${name}`}
            title="Default (left) → warmer (right)"
          />
          <Caption1
            className={mergeClasses(styles.sliderPct, styles.warmthPct)}
          >
            {warmth === 0 ? 'Default' : `Warm ${warmth}%`}
          </Caption1>
        </div>
      ) : null}

      {!m.brightness.supported &&
      !m.contrast.supported &&
      !m.redGain.supported &&
      !m.greenGain.supported &&
      !m.blueGain.supported ? (
        <Caption1 className={styles.note}>
          DDC/CI unavailable. Enable DDC/CI in this monitor's on-screen menu.
        </Caption1>
      ) : null}
    </div>
  );
}
