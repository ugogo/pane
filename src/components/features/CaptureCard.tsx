import { useEffect, useReducer } from 'react';
import { Eye } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { StatusBadge, StatusText } from './status-ui';

type ProbeStatus = 'idle' | 'pass' | 'warn' | 'fail';

interface State {
  hotkeys: { fullscreen: string; area: string };
  status: ProbeStatus;
  message: string;
  busy: boolean;
  previewVisible: boolean | null;
}

type Action =
  | { type: 'hotkeysLoaded'; hotkeys: { fullscreen: string; area: string } }
  | { type: 'bound'; action: CaptureAction; accel: string }
  | { type: 'cleared'; action: CaptureAction }
  | { type: 'busy'; busy: boolean }
  | { type: 'previewToggled'; visible: boolean }
  | { type: 'notify'; status: ProbeStatus; message: string };

const initialState: State = {
  hotkeys: { fullscreen: '', area: '' },
  status: 'idle',
  message: '',
  busy: false,
  previewVisible: null,
};

const actionLabels: Record<CaptureAction, string> = {
  fullscreen: 'full screen',
  area: 'area',
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
        message: `${actionLabels[action.action]} shortcut saved.`,
      };
    case 'cleared':
      return {
        ...state,
        hotkeys: { ...state.hotkeys, [action.action]: '' },
        status: 'idle',
        message: `${actionLabels[action.action]} shortcut cleared.`,
      };
    case 'busy':
      return { ...state, busy: action.busy };
    case 'previewToggled':
      return {
        ...state,
        previewVisible: action.visible,
        status: 'pass',
        message: action.visible
          ? 'Floating preview is visible.'
          : 'Floating preview is hidden.',
      };
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

export function CaptureCard({ className }: { className?: string }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { hotkeys, status, message, busy, previewVisible } = state;

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
        message:
          action === 'fullscreen'
            ? 'Captured the full screen.'
            : 'Area selection is ready.',
      });
    }
  }

  const previewLabel = previewVisible
    ? 'Hide floating preview'
    : 'Show floating preview';

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Capture</CardTitle>
        <CardDescription>
          Fullscreen and area capture with global shortcuts.
        </CardDescription>
        <CardAction>
          <StatusBadge status={status} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Row
            label="Fullscreen capture"
            actionLabel="Capture full screen"
            shortcutLabel="Fullscreen capture shortcut"
            hotkey={hotkeys.fullscreen}
            onCommit={(a) => void bind('fullscreen', a)}
            onClear={() => void clear('fullscreen')}
            onTrigger={() => void trigger('fullscreen')}
            busy={busy}
          />
          <Row
            label="Area capture"
            actionLabel="Select area"
            shortcutLabel="Area capture shortcut"
            hotkey={hotkeys.area}
            onCommit={(a) => void bind('area', a)}
            onClear={() => void clear('area')}
            onTrigger={() => void trigger('area')}
            busy={busy}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            size="sm"
            variant="secondary"
            aria-pressed={previewVisible ?? undefined}
            onClick={() => {
              void toggleCapturePreview().then((visible) => {
                dispatch({ type: 'previewToggled', visible });
              });
            }}
          >
            <Eye aria-hidden="true" className="size-3.5" />
            {previewLabel}
          </Button>
          {message && <StatusText status={status}>{message}</StatusText>}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  actionLabel,
  shortcutLabel,
  hotkey,
  onCommit,
  onClear,
  onTrigger,
  busy,
}: {
  label: string;
  actionLabel: string;
  shortcutLabel: string;
  hotkey: string;
  onCommit: (a: string) => void;
  onClear: () => void;
  onTrigger: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">{label}</p>
        <Button
          disabled={busy}
          className="w-full"
          size="sm"
          onClick={onTrigger}
        >
          {actionLabel}
        </Button>
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Shortcut</p>
        <ShortcutInput
          value={hotkey}
          onCommit={onCommit}
          onClear={onClear}
          ariaLabel={shortcutLabel}
          placeholder="Click and press a chord"
        />
      </div>
    </div>
  );
}
