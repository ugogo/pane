import { useEffect, useState } from 'react';
import {
  Button,
  Slider,
  Badge,
  Body1,
  Caption1,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  LightbulbRegular,
  CursorRegular,
  DeveloperBoardRegular,
  DesktopRegular,
} from '@fluentui/react-icons';
import { FeatureCard } from '../FeatureCard';
import { statusBadgeColor, type ProbeStatus } from '../../lib/status';
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
      return <CursorRegular fontSize={16} aria-hidden />;
    case 'msi':
      return <DeveloperBoardRegular fontSize={16} aria-hidden />;
    case 'dxlight':
      return <DesktopRegular fontSize={16} aria-hidden />;
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

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: '12px' },
  controls: { display: 'flex', alignItems: 'center', gap: '8px' },
  message: { color: tokens.colorNeutralForeground3 },
  error: { color: tokens.colorPaletteRedForeground1 },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px',
  },
  head: { display: 'flex', alignItems: 'flex-start', gap: '8px' },
  iconBox: {
    display: 'flex',
    flexShrink: 0,
    width: '32px',
    height: '32px',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.borderRadiusMedium,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
  text: { minWidth: 0, flexGrow: 1 },
  title: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  controlsRow: {
    display: 'flex',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: '12px',
  },
  colorInput: {
    width: '44px',
    height: '32px',
    padding: 0,
    cursor: 'pointer',
    borderRadius: tokens.borderRadiusMedium,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sliderCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flexGrow: 1,
    minWidth: '140px',
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

interface LightRowProps {
  light: Light;
  initialState?: LightState;
  disabledReason?: string;
  styles: Styles;
}

function LightRow({
  light,
  initialState,
  disabledReason,
  styles,
}: LightRowProps) {
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
  const visibleStatus: ProbeStatus = disabled ? 'disabled' : result.status;

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
    <div className={styles.row}>
      <div className={styles.head}>
        <div className={styles.iconBox}>
          <LightIcon light={light} />
        </div>
        <div className={styles.text}>
          <Body1 className={styles.title}>{lightTitle(light)}</Body1>
          <Caption1 className={styles.subtitle}>
            {lightSubtitle(light)}
          </Caption1>
        </div>
        <Badge appearance="filled" color={statusBadgeColor(visibleStatus)}>
          {visibleStatus}
        </Badge>
      </div>

      <div className={styles.controlsRow}>
        <input
          type="color"
          aria-label={`Color for ${lightTitle(light)}`}
          disabled={disabled}
          className={styles.colorInput}
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />

        <div className={styles.sliderCol}>
          <Caption1>Brightness {Math.round(brightness * 100)}%</Caption1>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={brightness}
            disabled={disabled}
            onChange={(_, data) => setBrightness(data.value)}
            aria-label={`Brightness for ${lightTitle(light)}`}
          />
        </div>

        <Button disabled={busy || disabled} onClick={() => void apply()}>
          Apply
        </Button>
        <Button
          appearance="subtle"
          disabled={busy || disabled}
          onClick={() => void turnOff()}
        >
          Off
        </Button>
      </div>

      {disabledReason ? (
        <Caption1 className={styles.note}>{disabledReason}</Caption1>
      ) : null}

      {result.message ? (
        <Caption1
          className={result.status === 'fail' ? styles.error : styles.message}
        >
          {result.message}
        </Caption1>
      ) : null}
    </div>
  );
}

interface Scan {
  status: ProbeStatus;
  message: string;
  disabledReason: string;
}

export function LightingCard() {
  const styles = useStyles();
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
    <FeatureCard
      wide
      title="Lights"
      description="Per-device color and brightness for Windows Dynamic Lighting, MSI Mystic Light, and the DX Light monitor bias strip."
      icon={<LightbulbRegular />}
      status={scan.status}
    >
      <div className={styles.body}>
        <div className={styles.controls}>
          <Button
            size="small"
            disabled={busy}
            onClick={() => {
              beginRefresh();
              void refresh();
            }}
          >
            Refresh
          </Button>
          <Button
            size="small"
            disabled={busy || keyedLights.length === 0}
            onClick={() => void restore()}
            title="Re-apply the last saved color/brightness to every light"
          >
            Restore
          </Button>
          {scan.message ? (
            <Caption1
              className={scan.status === 'fail' ? styles.error : styles.message}
            >
              {scan.message}
            </Caption1>
          ) : null}
        </div>

        {keyedLights.map(({ key, light }) => (
          <LightRow
            key={key}
            light={light}
            initialState={savedStates[key]}
            disabledReason={
              light.kind === 'dynamic' ? scan.disabledReason : undefined
            }
            styles={styles}
          />
        ))}
      </div>
    </FeatureCard>
  );
}
