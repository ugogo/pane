import { useReducer } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import { PageSpinner } from './page-spinner';
import { StatusText } from './status-ui';

type ProbeStatus = 'idle' | 'pass' | 'warn' | 'fail';

interface State {
  status: ProbeStatus;
  message: string;
  busy: boolean;
  previewVisible: boolean | null;
}

type Action =
  | { type: 'bound'; action: CaptureAction; accel: string }
  | { type: 'cleared'; action: CaptureAction }
  | { type: 'busy'; busy: boolean }
  | { type: 'previewToggled'; visible: boolean }
  | { type: 'notify'; status: ProbeStatus; message: string };

const initialState: State = {
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
    case 'bound':
      return {
        ...state,
        status: 'pass',
        message: `${actionLabels[action.action]} shortcut saved.`,
      };
    case 'cleared':
      return {
        ...state,
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
      return {
        ...state,
        status: action.status,
        message: action.message,
      };
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
  const queryClient = useQueryClient();
  const hotkeysQuery = useQuery({
    queryKey: queryKeys.captureHotkeys,
    queryFn: async () => {
      const saved = await getCaptureHotkeys();
      return { fullscreen: saved.fullscreen, area: saved.area };
    },
  });
  const hotkeys = hotkeysQuery.data ?? { fullscreen: '', area: '' };
  const [state, dispatch] = useReducer(reducer, initialState);
  const { status, message, busy, previewVisible } = state;

  async function bind(action: CaptureAction, accel: string) {
    try {
      await setCaptureHotkey(action, accel);
      queryClient.setQueryData(
        queryKeys.captureHotkeys,
        (prev: { fullscreen: string; area: string } | undefined) => ({
          fullscreen: prev?.fullscreen ?? '',
          area: prev?.area ?? '',
          [action]: accel,
        }),
      );
      dispatch({ type: 'bound', action, accel });
    } catch (err) {
      dispatch({ type: 'notify', status: 'fail', message: String(err) });
    }
  }

  async function clear(action: CaptureAction) {
    try {
      await clearCaptureHotkey(action);
      queryClient.setQueryData(
        queryKeys.captureHotkeys,
        (prev: { fullscreen: string; area: string } | undefined) => ({
          fullscreen: prev?.fullscreen ?? '',
          area: prev?.area ?? '',
          [action]: '',
        }),
      );
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

  if (hotkeysQuery.isPending && !hotkeysQuery.data) {
    return <PageSpinner className={className} />;
  }

  if (hotkeysQuery.isError) {
    return (
      <div className={cn('space-y-4', className)}>
        <StatusText status="warn">
          Could not load saved hotkeys: {String(hotkeysQuery.error)}
        </StatusText>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
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
    </div>
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
