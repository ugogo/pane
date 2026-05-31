import { useEffect, useState } from 'react';
import {
  Switch,
  Caption1,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { TextCaseTitleRegular } from '@fluentui/react-icons';
import { FeatureCard } from '../FeatureCard';
import type { ProbeStatus } from '../../lib/status';
import {
  getAccentPopupEnabled,
  setAccentPopupEnabled,
} from '../../lib/commands';

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
});

export function AccentCard() {
  const styles = useStyles();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void getAccentPopupEnabled()
      .then(setEnabled)
      .catch((err: unknown) => setError(String(err)));
  }, []);

  async function handleToggle(next: boolean) {
    setError(undefined);
    const prev = enabled;
    setEnabled(next);
    try {
      await setAccentPopupEnabled(next);
    } catch (err) {
      setEnabled(prev ?? null);
      setError(String(err));
    }
  }

  const status: ProbeStatus = error
    ? 'fail'
    : enabled === null
      ? 'idle'
      : 'pass';

  return (
    <FeatureCard
      title="Accent popup"
      description="Hold a letter (a, e, c, …) to pick an accented variant: à â é ç ô …"
      icon={<TextCaseTitleRegular />}
      status={status}
    >
      <div className={styles.body}>
        <Switch
          checked={enabled ?? false}
          disabled={enabled === null}
          onChange={(_, data) => void handleToggle(data.checked)}
          label="Enable long-press accents"
        />
        <Caption1 className={styles.hint}>
          Works in text fields, Chromium/Electron apps, and terminals. Pick a
          variant with a click or its number key; Esc dismisses.
        </Caption1>
        {error ? <Caption1 className={styles.error}>{error}</Caption1> : null}
      </div>
    </FeatureCard>
  );
}
