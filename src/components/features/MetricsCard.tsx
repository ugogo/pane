import { useEffect, useEffectEvent, useState } from 'react';
import {
  Switch,
  Button,
  Caption1,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { TopSpeedRegular } from '@fluentui/react-icons';
import { FeatureCard } from '../FeatureCard';
import type { ProbeStatus } from '../../lib/status';
import { getProcessMetrics, type ProcessMetrics } from '../../lib/commands';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtMb(mb: number) {
  return mb < 1 ? `${Math.round(mb * 1024)} KB` : `${mb.toFixed(1)} MB`;
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

// pass < 150 MB · warn 150–300 MB · fail > 300 MB
function ramStatus(mb: number): ProbeStatus {
  if (mb < 150) return 'pass';
  if (mb < 300) return 'warn';
  return 'fail';
}

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '12px',
  },
  stat: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    paddingTop: '8px',
    paddingBottom: '8px',
    paddingLeft: '12px',
    paddingRight: '12px',
  },
  statLabel: {
    color: tokens.colorNeutralForeground3,
  },
  statValue: {
    marginTop: '2px',
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: '14px',
    fontWeight: tokens.fontWeightSemibold,
  },
  sparkLabel: {
    color: tokens.colorNeutralForeground3,
    marginBottom: '4px',
    display: 'block',
  },
  spark: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '1px',
    height: '32px',
  },
  bar: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    borderRadius: '2px',
    opacity: 0.85,
  },
  barPass: { backgroundColor: tokens.colorPaletteGreenBackground3 },
  barWarn: { backgroundColor: tokens.colorPaletteYellowBackground3 },
  barFail: { backgroundColor: tokens.colorPaletteRedBackground3 },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
});

type Styles = ReturnType<typeof useStyles>;

function Sparkline({ history, styles }: { history: number[]; styles: Styles }) {
  if (history.length < 2) return null;
  const max = Math.max(...history, 1);
  return (
    <div className={styles.spark} title="Working set over time">
      {history.map((mb, i) => {
        const pct = Math.max((mb / max) * 100, 4);
        const status = ramStatus(mb);
        const barColor =
          status === 'pass'
            ? styles.barPass
            : status === 'warn'
              ? styles.barWarn
              : styles.barFail;
        return (
          <div
            key={i}
            className={mergeClasses(styles.bar, barColor)}
            style={{ height: `${pct}%` }}
            title={fmtMb(mb)}
          />
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: Styles;
}) {
  return (
    <div className={styles.stat}>
      <Caption1 className={styles.statLabel}>{label}</Caption1>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}

export function MetricsCard() {
  const styles = useStyles();
  const [metrics, setMetrics] = useState<ProcessMetrics | null>(null);
  const [error, setError] = useState<string>();
  const [autoRefresh, setAutoRefresh] = useState(true);
  // Rolling window of the last 30 working-set samples (MB)
  const [history, setHistory] = useState<number[]>([]);

  // State updates live in the deferred `.then`/`.catch` callbacks, not the
  // synchronous body, so this is safe to call from an effect.
  function refresh() {
    return getProcessMetrics()
      .then((m) => {
        setMetrics(m);
        setError(undefined);
        setHistory((prev) => [...prev.slice(-29), m.workingSetMb]);
      })
      .catch((err: unknown) => setError(String(err)));
  }

  // Effect Event: always sees the latest state, never a dependency.
  const onTick = useEffectEvent(() => void refresh());

  // First fetch on mount, then poll every 2 s while auto-refresh is on.
  useEffect(() => {
    onTick();
    if (!autoRefresh) return;
    const id = setInterval(onTick, 2000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const status: ProbeStatus = error
    ? 'fail'
    : metrics
      ? ramStatus(metrics.workingSetMb)
      : 'idle';

  return (
    <FeatureCard
      wide
      title="Process metrics"
      description="Live RAM and startup time. Benchmark against the WinUI 3 baseline before validating any other checklist item."
      icon={<TopSpeedRegular />}
      status={status}
    >
      <div className={styles.body}>
        {error ? (
          <Caption1 className={styles.error}>{error}</Caption1>
        ) : metrics ? (
          <>
            <div className={styles.statGrid}>
              <Stat
                label="Working set"
                value={fmtMb(metrics.workingSetMb)}
                styles={styles}
              />
              <Stat
                label="Virtual mem"
                value={fmtMb(metrics.virtualMemoryMb)}
                styles={styles}
              />
              <Stat
                label="Startup elapsed"
                value={fmtMs(metrics.startupElapsedMs)}
                styles={styles}
              />
              <Stat label="PID" value={String(metrics.pid)} styles={styles} />
            </div>

            {history.length > 1 ? (
              <div>
                <Caption1 className={styles.sparkLabel}>
                  Working set · last {history.length} samples
                </Caption1>
                <Sparkline history={history} styles={styles} />
              </div>
            ) : null}
          </>
        ) : (
          <Caption1 className={styles.statLabel}>Fetching…</Caption1>
        )}

        <div className={styles.controls}>
          <Button size="small" onClick={() => void refresh()}>
            Refresh now
          </Button>
          <Switch
            checked={autoRefresh}
            onChange={(_, data) => setAutoRefresh(data.checked)}
            label="Auto-refresh every 2 s"
          />
        </div>
      </div>
    </FeatureCard>
  );
}
