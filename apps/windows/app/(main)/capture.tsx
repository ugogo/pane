import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye } from '@pane/ui';
import { Button, Card, Label, MutedText, XStack, YStack } from '@pane/ui';
import { ShortcutInput } from '@/components/ShortcutInput';
import { PageSpinner } from '@/components/features/page-spinner';
import { StatusText } from '@/components/features/status-ui';
import {
  captureFullscreen,
  clearGlobalHotkey,
  listGlobalHotkeys,
  setGlobalHotkey,
  showAreaSelector,
  showCapturePreview,
  toggleCapturePreview,
  type HotkeyAction,
  type HotkeyBindingView,
} from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';

// The Capture page exposes the two capture bindings of the shared global
// hotkeys manager. `TriggerKind` names the local capture action each card runs.
type TriggerKind = 'fullscreen' | 'area';

const captureActions: Record<TriggerKind, HotkeyAction> = {
  fullscreen: 'capture-fullscreen',
  area: 'capture-area',
};

const actionLabels: Record<TriggerKind, string> = {
  fullscreen: 'full screen',
  area: 'area',
};

export default function CapturePage() {
  const queryClient = useQueryClient();
  const hotkeysQuery = useQuery({
    queryKey: queryKeys.globalHotkeys,
    queryFn: listGlobalHotkeys,
  });
  const acceleratorFor = (action: HotkeyAction) =>
    hotkeysQuery.data?.find((row) => row.action === action)?.accelerator ?? '';
  const hotkeys = {
    fullscreen: acceleratorFor('capture-fullscreen'),
    area: acceleratorFor('capture-area'),
  };
  const hotkeysError = hotkeysQuery.isError
    ? `Could not load saved hotkeys: ${String(hotkeysQuery.error)}`
    : '';
  const status = useActionStatus();
  const [previewVisible, setPreviewVisible] = useState<boolean | null>(null);

  function patchHotkey(action: HotkeyAction, accelerator: string) {
    queryClient.setQueryData(
      queryKeys.globalHotkeys,
      (prev: HotkeyBindingView[] | undefined) =>
        prev?.map((row) =>
          row.action === action ? { ...row, accelerator } : row,
        ),
    );
  }

  const bind = useMutation({
    mutationFn: ({ kind, accel }: { kind: TriggerKind; accel: string }) =>
      setGlobalHotkey(captureActions[kind], accel),
    onSuccess: (result, { kind }) => {
      patchHotkey(captureActions[kind], result.accelerator);
      status.set('pass', `${actionLabels[kind]} shortcut saved.`);
    },
    onError: (err) => status.set('fail', String(err)),
  });

  const clear = useMutation({
    mutationFn: (kind: TriggerKind) => clearGlobalHotkey(captureActions[kind]),
    onSuccess: (_result, kind) => {
      patchHotkey(captureActions[kind], '');
      status.set('idle', `${actionLabels[kind]} shortcut cleared.`);
    },
    onError: (err) => status.set('fail', String(err)),
  });

  const trigger = useMutation({
    mutationFn: async (action: TriggerKind) => {
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

  return (
    <YStack gap="$4">
      <XStack flexWrap="wrap" gap="$3">
        <CaptureRow
          label="Fullscreen capture"
          actionLabel="Capture full screen"
          shortcutLabel="Fullscreen capture shortcut"
          hotkey={hotkeys.fullscreen}
          onCommit={(accel) => bind.mutate({ kind: 'fullscreen', accel })}
          onClear={() => clear.mutate('fullscreen')}
          onTrigger={() => trigger.mutate('fullscreen')}
          busy={trigger.isPending}
        />
        <CaptureRow
          label="Area capture"
          actionLabel="Select area"
          shortcutLabel="Area capture shortcut"
          hotkey={hotkeys.area}
          onCommit={(accel) => bind.mutate({ kind: 'area', accel })}
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
        ) : hotkeysError ? (
          <StatusText status="warn">{hotkeysError}</StatusText>
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
