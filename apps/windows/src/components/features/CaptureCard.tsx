import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  type CaptureHotkeys,
} from '../../lib/commands';
import { ShortcutInput } from '../ShortcutInput';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';
import { PageSpinner } from './page-spinner';
import { StatusText } from './status-ui';

const actionLabels: Record<CaptureAction, string> = {
  fullscreen: 'full screen',
  area: 'area',
};

export function CaptureCard({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const hotkeysQuery = useQuery({
    queryKey: queryKeys.captureHotkeys,
    queryFn: getCaptureHotkeys,
  });
  const hotkeys = hotkeysQuery.data ?? { fullscreen: '', area: '' };
  const status = useActionStatus();
  const [previewVisible, setPreviewVisible] = useState<boolean | null>(null);

  function patchHotkey(action: CaptureAction, accelerator: string) {
    queryClient.setQueryData(
      queryKeys.captureHotkeys,
      (prev: CaptureHotkeys | undefined) => ({
        fullscreen: prev?.fullscreen ?? '',
        area: prev?.area ?? '',
        [action]: accelerator,
      }),
    );
  }

  const bind = useMutation({
    mutationFn: ({ action, accel }: { action: CaptureAction; accel: string }) =>
      setCaptureHotkey(action, accel),
    onSuccess: (_result, { action, accel }) => {
      patchHotkey(action, accel);
      status.set('pass', `${actionLabels[action]} shortcut saved.`);
    },
    onError: (err) => status.set('fail', String(err)),
  });

  const clear = useMutation({
    mutationFn: (action: CaptureAction) => clearCaptureHotkey(action),
    onSuccess: (_result, action) => {
      patchHotkey(action, '');
      status.set('idle', `${actionLabels[action]} shortcut cleared.`);
    },
    onError: (err) => status.set('fail', String(err)),
  });

  const trigger = useMutation({
    mutationFn: async (action: CaptureAction) => {
      if (action === 'fullscreen') {
        await captureFullscreen();
        await showCapturePreview();
      } else {
        await showAreaSelector();
      }
      return action;
    },
    onSuccess: (action) =>
      status.set(
        'pass',
        action === 'fullscreen'
          ? 'Captured the full screen.'
          : 'Area selection is ready.',
      ),
    onError: (err) => status.set('fail', String(err)),
  });

  const preview = useMutation({
    mutationFn: toggleCapturePreview,
    onSuccess: (visible) => {
      setPreviewVisible(visible);
      status.set(
        'pass',
        visible
          ? 'Floating preview is visible.'
          : 'Floating preview is hidden.',
      );
    },
    onError: (err) => status.set('fail', String(err)),
  });

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
          onCommit={(accel) => bind.mutate({ action: 'fullscreen', accel })}
          onClear={() => clear.mutate('fullscreen')}
          onTrigger={() => trigger.mutate('fullscreen')}
          busy={trigger.isPending}
        />
        <Row
          label="Area capture"
          actionLabel="Select area"
          shortcutLabel="Area capture shortcut"
          hotkey={hotkeys.area}
          onCommit={(accel) => bind.mutate({ action: 'area', accel })}
          onClear={() => clear.mutate('area')}
          onTrigger={() => trigger.mutate('area')}
          busy={trigger.isPending}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          size="sm"
          variant="secondary"
          aria-pressed={previewVisible ?? undefined}
          onClick={() => preview.mutate()}
        >
          <Eye aria-hidden="true" className="size-3.5" />
          {previewVisible ? 'Hide floating preview' : 'Show floating preview'}
        </Button>
        {status.message && (
          <StatusText status={status.status}>{status.message}</StatusText>
        )}
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
