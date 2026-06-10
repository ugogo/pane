import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Label, MutedText, YStack } from '@pane/ui';
import { ShortcutInput } from '@/components/ShortcutInput';
import { StatusText } from '@/components/features/status-ui';
import {
  clearGlobalHotkey,
  listGlobalHotkeys,
  setGlobalHotkey,
  type HotkeyAction,
  type HotkeyBindingView,
} from '@/lib/commands';
import { hotkeyActionMeta } from '@/lib/hotkey-actions';
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';

/**
 * Manager UI for every global shortcut Pane can bind. Reads the authoritative
 * action list from Rust (`list_global_hotkeys`) and renders the shared display
 * metadata next to a [`ShortcutInput`] per row. Set/clear route through the
 * generalized manager commands, surfacing in-Pane conflicts and OS registration
 * failures as inline status text.
 */
export function GlobalHotkeysCard() {
  const queryClient = useQueryClient();
  const hotkeysQuery = useQuery({
    queryKey: queryKeys.globalHotkeys,
    queryFn: listGlobalHotkeys,
  });
  const bindings = hotkeysQuery.data ?? [];
  const loadError = hotkeysQuery.isError
    ? `Could not load shortcuts: ${String(hotkeysQuery.error)}`
    : '';
  const status = useActionStatus();

  function patchBinding(action: HotkeyAction, accelerator: string) {
    queryClient.setQueryData(
      queryKeys.globalHotkeys,
      (prev: HotkeyBindingView[] | undefined) =>
        prev?.map((row) =>
          row.action === action ? { ...row, accelerator } : row,
        ),
    );
  }

  const bind = useMutation({
    mutationFn: ({ action, accel }: { action: HotkeyAction; accel: string }) =>
      setGlobalHotkey(action, accel),
    onSuccess: (result, { action }) => {
      patchBinding(action, result.accelerator);
      status.set('pass', `${hotkeyActionMeta(action).label} shortcut saved.`);
    },
    onError: (err) => status.set('fail', String(err)),
  });

  const clear = useMutation({
    mutationFn: (action: HotkeyAction) => clearGlobalHotkey(action),
    onSuccess: (_result, action) => {
      patchBinding(action, '');
      status.set('idle', `${hotkeyActionMeta(action).label} shortcut cleared.`);
    },
    onError: (err) => status.set('fail', String(err)),
  });

  return (
    <Card gap="$3" padding="$3">
      <YStack gap="$1">
        <Label fontSize="$3">Global shortcuts</Label>
        <MutedText fontSize="$3">
          Trigger Pane actions from anywhere. Click a field and press a chord;
          press Backspace to clear.
        </MutedText>
      </YStack>

      <YStack gap="$3">
        {bindings.map((row) => {
          const meta = hotkeyActionMeta(row.action);
          return (
            <YStack key={row.action} gap="$2">
              <YStack gap="$1" style={{ minWidth: 0 }}>
                <Label fontSize="$3">{meta.label}</Label>
                <MutedText fontSize="$2">{meta.description}</MutedText>
              </YStack>
              <ShortcutInput
                value={row.accelerator}
                ariaLabel={`${meta.label} shortcut`}
                placeholder="Click and press a chord"
                onCommit={(accel) => bind.mutate({ action: row.action, accel })}
                onClear={() => clear.mutate(row.action)}
              />
            </YStack>
          );
        })}
      </YStack>

      {status.message ? (
        <StatusText status={status.status}>{status.message}</StatusText>
      ) : loadError ? (
        <StatusText status="warn">{loadError}</StatusText>
      ) : null}
    </Card>
  );
}
