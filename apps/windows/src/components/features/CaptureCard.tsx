import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye } from '@pane/ui';
import { Button, Card, Label, MutedText, XStack, YStack } from '@pane/ui';
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
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';
import { PageSpinner } from './page-spinner';
import { StatusText } from './status-ui';

const actionLabels: Record<CaptureAction, string> = {
  fullscreen: 'full screen',
  area: 'area',
};

export function CaptureCard() {
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
    return <PageSpinner />;
  }

  if (hotkeysQuery.isError) {
    return (
      <YStack gap="$4">
        <StatusText status="warn">
          Could not load saved hotkeys: {String(hotkeysQuery.error)}
        </StatusText>
      </YStack>
    );
  }

  return (
    <YStack gap="$4">
      <XStack flexWrap="wrap" gap="$3">
        <CaptureRow
          label="Fullscreen capture"
          actionLabel="Capture full screen"
          shortcutLabel="Fullscreen capture shortcut"
          hotkey={hotkeys.fullscreen}
          onCommit={(accel) => bind.mutate({ action: 'fullscreen', accel })}
          onClear={() => clear.mutate('fullscreen')}
          onTrigger={() => trigger.mutate('fullscreen')}
          busy={trigger.isPending}
        />
        <CaptureRow
          label="Area capture"
          actionLabel="Select area"
          shortcutLabel="Area capture shortcut"
          hotkey={hotkeys.area}
          onCommit={(accel) => bind.mutate({ action: 'area', accel })}
          onClear={() => clear.mutate('area')}
          onTrigger={() => trigger.mutate('area')}
          busy={trigger.isPending}
        />
      </XStack>

      <XStack flexDirection="column" gap="$2">
        <Button
          aria-pressed={previewVisible ?? undefined}
          icon={<Eye aria-hidden size={14} />}
          btnScale="sm"
          appearance="secondary"
          onPress={() => preview.mutate()}
        >
          {previewVisible ? 'Hide floating preview' : 'Show floating preview'}
        </Button>
        {status.message ? (
          <StatusText status={status.status}>{status.message}</StatusText>
        ) : null}
      </XStack>
    </YStack>
  );
}

function CaptureRow({
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
    <Card flex={1} gap="$3" padding="$3" style={{ minWidth: 280 }}>
      <YStack gap="$2">
        <Label fontSize="$3">{label}</Label>
        <Button disabled={busy} btnScale="sm" width="100%" onPress={onTrigger}>
          {actionLabel}
        </Button>
      </YStack>
      <YStack gap="$1">
        <MutedText fontSize="$2">Shortcut</MutedText>
        <ShortcutInput
          value={hotkey}
          onCommit={onCommit}
          onClear={onClear}
          ariaLabel={shortcutLabel}
          placeholder="Click and press a chord"
        />
      </YStack>
    </Card>
  );
}
