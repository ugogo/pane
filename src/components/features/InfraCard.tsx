import { useEffect, useState } from 'react';
import {
  Switch,
  Body1,
  Caption1,
  Divider,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { PlugConnectedRegular } from '@fluentui/react-icons';
import { FeatureCard } from '../FeatureCard';
import type { ProbeStatus } from '../../lib/status';
import {
  getRunAtStartup,
  setRunAtStartup,
  type StartupResult,
} from '../../lib/commands';

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  rowText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
  warn: {
    color: tokens.colorStatusWarningForeground1,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
  code: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: '12px',
    backgroundColor: tokens.colorNeutralBackground3,
    paddingLeft: '4px',
    paddingRight: '4px',
    borderRadius: tokens.borderRadiusSmall,
  },
});

export function InfraCard() {
  const styles = useStyles();
  const [runAtStartup, setRunAtStartupState] = useState<boolean | null>(null);
  const [startupResult, setStartupResult] = useState<StartupResult | null>(
    null,
  );
  const [startupError, setStartupError] = useState<string>();

  // Read current registry state on mount.
  useEffect(() => {
    void getRunAtStartup()
      .then(setRunAtStartupState)
      .catch((err: unknown) => setStartupError(String(err)));
  }, []);

  async function handleStartupToggle(enabled: boolean) {
    setStartupError(undefined);
    try {
      const result = await setRunAtStartup(enabled);
      setRunAtStartupState(result.enabled);
      setStartupResult(result);
    } catch (err) {
      setStartupError(String(err));
    }
  }

  const startupStatus: ProbeStatus = startupError
    ? 'fail'
    : startupResult
      ? 'pass'
      : 'idle';

  return (
    <FeatureCard
      title="Core infrastructure"
      description="Tray icon, hide-to-tray, single instance, and run-at-startup."
      icon={<PlugConnectedRegular />}
      status={startupStatus}
    >
      <div className={styles.body}>
        {/* Run at startup */}
        <div className={styles.row}>
          <div className={styles.rowText}>
            <Body1>Run at startup</Body1>
            <Caption1 className={styles.hint}>
              Writes / removes{' '}
              <code className={styles.code}>HKCU\…\Run\Pane</code>
              {import.meta.env.DEV ? (
                <span className={styles.warn}>
                  {' '}
                  (disabled in dev; would register the debug binary)
                </span>
              ) : null}
            </Caption1>
          </div>
          <Switch
            aria-label="Run at startup"
            disabled={runAtStartup === null || import.meta.env.DEV}
            checked={runAtStartup ?? false}
            onChange={(_, data) => void handleStartupToggle(data.checked)}
          />
        </div>
        {startupResult ? (
          <Caption1 className={styles.hint}>{startupResult.detail}</Caption1>
        ) : null}
        {startupError ? (
          <Caption1 className={styles.error}>{startupError}</Caption1>
        ) : null}

        <Divider />

        {/* Tray + hide-to-tray */}
        <div className={styles.rowText}>
          <Body1>Hide to tray</Body1>
          <Caption1 className={styles.hint}>
            Close this window; it should disappear to the system tray without
            exiting. Left-click the tray icon or choose <em>Show Pane</em> to
            restore it.
          </Caption1>
        </div>

        <Divider />

        {/* Single instance */}
        <div className={styles.rowText}>
          <Body1>Single instance</Body1>
          <Caption1 className={styles.hint}>
            Launch a second copy of{' '}
            <code className={styles.code}>pane.exe</code> while this window is
            open; the second process should exit immediately and this window
            should come to the foreground.
          </Caption1>
        </div>
      </div>
    </FeatureCard>
  );
}
