import { useEffect, useReducer } from 'react';
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

type ProbeStatus = 'idle' | 'pass' | 'warn' | 'fail';

const statusStyles: Record<ProbeStatus, string> = {
  idle: 'bg-neutral-100 text-neutral-600',
  pass: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-800',
  fail: 'bg-rose-100 text-rose-800',
};

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

export function CaptureCard() {
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
    <div className="border-line col-span-2 rounded-lg border bg-white/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-ink text-base font-semibold">Screen capture</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            Fullscreen and area capture, triggerable via global hotkeys. The
            area selector overlay is centred at half monitor width and half
            height minus 50px.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[status]}`}
        >
          {status}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Row
          label="Fullscreen capture"
          hotkey={hotkeys.fullscreen}
          onCommit={(a) => void bind('fullscreen', a)}
          onClear={() => void clear('fullscreen')}
          onTrigger={() => void trigger('fullscreen')}
          busy={busy}
        />
        <Row
          label="Area capture"
          hotkey={hotkeys.area}
          onCommit={(a) => void bind('area', a)}
          onClear={() => void clear('area')}
          onTrigger={() => void trigger('area')}
          busy={busy}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className="border-line rounded-md border bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50"
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
        </button>
        {message && (
          <p
            className={`text-xs ${status === 'fail' ? 'text-rose-600' : 'text-neutral-500'}`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  hotkey,
  onCommit,
  onClear,
  onTrigger,
  busy,
}: {
  label: string;
  hotkey: string;
  onCommit: (a: string) => void;
  onClear: () => void;
  onTrigger: () => void;
  busy: boolean;
}) {
  return (
    <div className="border-line rounded-md border p-3">
      <p className="text-ink text-sm font-medium">{label}</p>
      <div className="mt-2">
        <ShortcutInput
          value={hotkey}
          onCommit={onCommit}
          onClear={onClear}
          placeholder="Click and press a chord"
        />
      </div>
      <button
        type="button"
        disabled={busy}
        className="border-line text-ink mt-2 rounded-md border bg-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
        onClick={onTrigger}
      >
        Trigger now
      </button>
    </div>
  );
}
