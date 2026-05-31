import { useEffect, useReducer } from 'react';
import {
  Button,
  Body1,
  Caption1,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { ScreenshotRegular } from '@fluentui/react-icons';
import { FeatureCard } from '../FeatureCard';
import type { ProbeStatus } from '../../lib/status';
import {
  captureFullscreen,
  clearCaptureHotkey,
  getCaptureHotkeys,
  setCaptureHotkey,
  showAreaSelector,
  showCapturePreview,
  toggleCapturePreview,
  type CaptureAction,
} from '../../lib/commands';
import { ShortcutInput } from '../ShortcutInput';

interface State {
  hotkeys: { fullscreen: string; area: string };
  status: ProbeStatus;
  message: string;
  busy: boolean;
}

type Action =
  | { type: 'hotkeysLoaded'; hotkeys: { fullscreen: string; area: string } }
  | { type: 'bound'; action: CaptureAction; accel: string }
  | { type: 'cleared'; action: CaptureAction }
  | { type: 'busy'; busy: boolean }
  | { type: 'notify'; status: ProbeStatus; message: string };

const initialState: State = {
  hotkeys: { fullscreen: '', area: '' },
  status: 'idle',
  message: '',
  busy: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hotkeysLoaded':
      return { ...state, hotkeys: action.hotkeys };
    case 'bound':
      return {
        ...state,
        hotkeys: { ...state.hotkeys, [action.action]: action.accel },
        status: 'pass',
        message: `Bound ${action.action} → ${action.accel}`,
      };
    case 'cleared':
      return {
        ...state,
        hotkeys: { ...state.hotkeys, [action.action]: '' },
        status: 'idle',
        message: `Cleared ${action.action} hotkey.`,
      };
    case 'busy':
      return { ...state, busy: action.busy };
    case 'notify':
      return { ...state, status: action.status, message: action.message };
  }
}

async function runFullscreen(): Promise<string | null> {
  try {
    await captureFullscreen();
    await showCapturePreview();
    return null;
  } catch (err) {
    return String(err);
  }
}

async function runArea(): Promise<string | null> {
  try {
    await showAreaSelector();
    return null;
  } catch (err) {
    return String(err);
  }
}

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '12px',
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  message: {
    color: tokens.colorNeutralForeground3,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
});

type Styles = ReturnType<typeof useStyles>;

function Row({
  label,
  hotkey,
  onCommit,
  onClear,
  onTrigger,
  busy,
  styles,
}: {
  label: string;
  hotkey: string;
  onCommit: (a: string) => void;
  onClear: () => void;
  onTrigger: () => void;
  busy: boolean;
  styles: Styles;
}) {
  return (
    <div className={styles.tile}>
      <Body1>{label}</Body1>
      <ShortcutInput
        value={hotkey}
        onCommit={onCommit}
        onClear={onClear}
        placeholder="Click and press a chord"
      />
      <div>
        <Button size="small" disabled={busy} onClick={onTrigger}>
          Trigger now
        </Button>
      </div>
    </div>
  );
}

export function CaptureCard() {
  const styles = useStyles();
  const [state, dispatch] = useReducer(reducer, initialState);
  const { hotkeys, status, message, busy } = state;

  useEffect(() => {
    void getCaptureHotkeys()
      .then((saved) =>
        dispatch({
          type: 'hotkeysLoaded',
          hotkeys: { fullscreen: saved.fullscreen, area: saved.area },
        }),
      )
      .catch((err: unknown) =>
        dispatch({
          type: 'notify',
          status: 'warn',
          message: `Could not load saved hotkeys: ${String(err)}`,
        }),
      );
  }, []);

  async function bind(action: CaptureAction, accel: string) {
    try {
      await setCaptureHotkey(action, accel);
      dispatch({ type: 'bound', action, accel });
    } catch (err) {
      dispatch({ type: 'notify', status: 'fail', message: String(err) });
    }
  }

  async function clear(action: CaptureAction) {
    try {
      await clearCaptureHotkey(action);
      dispatch({ type: 'cleared', action });
    } catch (err) {
      dispatch({ type: 'notify', status: 'fail', message: String(err) });
    }
  }

  async function trigger(action: CaptureAction) {
    dispatch({ type: 'busy', busy: true });
    const err =
      action === 'fullscreen' ? await runFullscreen() : await runArea();
    dispatch({ type: 'busy', busy: false });
    if (err) {
      dispatch({ type: 'notify', status: 'fail', message: err });
    } else {
      dispatch({
        type: 'notify',
        status: 'pass',
        message: `Triggered ${action}.`,
      });
    }
  }

  return (
    <FeatureCard
      wide
      title="Screen capture"
      description="Fullscreen and area capture, triggerable via global hotkeys. The area selector overlay is centred at half monitor width and half height minus 50px."
      icon={<ScreenshotRegular />}
      status={status}
    >
      <div className={styles.body}>
        <div className={styles.grid}>
          <Row
            label="Fullscreen capture"
            hotkey={hotkeys.fullscreen}
            onCommit={(a) => void bind('fullscreen', a)}
            onClear={() => void clear('fullscreen')}
            onTrigger={() => void trigger('fullscreen')}
            busy={busy}
            styles={styles}
          />
          <Row
            label="Area capture"
            hotkey={hotkeys.area}
            onCommit={(a) => void bind('area', a)}
            onClear={() => void clear('area')}
            onTrigger={() => void trigger('area')}
            busy={busy}
            styles={styles}
          />
        </div>

        <div className={styles.controls}>
          <Button
            size="small"
            appearance="subtle"
            onClick={() => {
              void toggleCapturePreview().then((visible) => {
                dispatch({
                  type: 'notify',
                  status: 'idle',
                  message: visible ? 'Preview shown.' : 'Preview hidden.',
                });
              });
            }}
          >
            Toggle preview
          </Button>
          {message ? (
            <Caption1
              className={status === 'fail' ? styles.error : styles.message}
            >
              {message}
            </Caption1>
          ) : null}
        </div>
      </div>
    </FeatureCard>
  );
}
