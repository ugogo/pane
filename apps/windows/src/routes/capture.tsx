import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { EyeIcon } from 'lucide-react';
import { Button, Card, Grid, Text, YStack } from 'pickle-ui';
import { ShortcutInput } from '@/components/ShortcutInput';
import { PageSpinner } from '@/components/features/page-spinner';
import { PageStatus } from '@/components/page-status';
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
} from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';

const actionLabels: Record<CaptureAction, string> = {
  fullscreen: 'full screen',
  area: 'area',
};

export const Route = createFileRoute('/capture')({
  component: CapturePage,
});

function CapturePage() {
  const queryClient = useQueryClient();
  const hotkeysQuery = useQuery({
    queryKey: queryKeys.captureHotkeys,
    queryFn: getCaptureHotkeys,
  });
  const hotkeys = hotkeysQuery.data ?? { fullscreen: '', area: '' };
  const hotkeysError = hotkeysQuery.isError
    ? `Could not load saved hotkeys: ${String(hotkeysQuery.error)}`
    : '';
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

  return (
    <YStack gap={4}>
      <PageStatus status={status.status}>{status.message}</PageStatus>
      <PageStatus status="warn">{hotkeysError}</PageStatus>

      <Grid
        className="grid-cols-[repeat(auto-fit,minmax(17.5rem,1fr))]"
        gap={3}
      >
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
      </Grid>

      <Card>
        <Card.Content>
          <YStack gap={2}>
            <Text as="h2" weight="bold">
              Floating preview
            </Text>
            <Text tone="muted">
              Show or hide the capture preview window after taking a screenshot.
            </Text>
            <div className="grid">
              <Button
                aria-pressed={previewVisible ?? undefined}
                variant="secondary"
                onClick={() => preview.mutate()}
              >
                <EyeIcon aria-hidden size={14} />
                {previewVisible
                  ? 'Hide floating preview'
                  : 'Show floating preview'}
              </Button>
            </div>
          </YStack>
        </Card.Content>
      </Card>
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
    <Card>
      <Card.Content>
        <YStack gap={2}>
          <Text as="h2" weight="bold">
            {label}
          </Text>
          <div className="grid">
            <Button disabled={busy} onClick={onTrigger}>
              {actionLabel}
            </Button>
          </div>
        </YStack>
        <div className="mt-3">
          <YStack gap={1}>
            <Text tone="muted">Shortcut</Text>
            <ShortcutInput
              value={hotkey}
              onCommit={onCommit}
              onClear={onClear}
              ariaLabel={shortcutLabel}
              placeholder="Click and press a chord"
            />
          </YStack>
        </div>
      </Card.Content>
    </Card>
  );
}
