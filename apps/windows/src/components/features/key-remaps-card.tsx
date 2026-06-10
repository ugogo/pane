import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Button,
  Card,
  Label,
  MutedText,
  Plus,
  Text,
  Trash2,
  XStack,
  YStack,
} from '@pane/ui';
import { ShortcutInput } from '@/components/ShortcutInput';
import { StatusText } from '@/components/features/status-ui';
import {
  addKeyRemap,
  listKeyRemaps,
  removeKeyRemap,
  type KeyRemapView,
} from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';

/**
 * Manager UI for key-to-key remaps: pressing the source chord anywhere
 * synthesizes the target chord (e.g. Alt+V → Ctrl+V). Existing remaps are
 * listed with a remove control; a draft row at the bottom adds new ones. Source
 * conflicts and OS registration failures surface as inline status text.
 */
export function KeyRemapsCard() {
  const queryClient = useQueryClient();
  const remapsQuery = useQuery({
    queryKey: queryKeys.keyRemaps,
    queryFn: listKeyRemaps,
  });
  const remaps = remapsQuery.data ?? [];
  const loadError = remapsQuery.isError
    ? `Could not load key remaps: ${String(remapsQuery.error)}`
    : '';
  const status = useActionStatus();

  const [draftSource, setDraftSource] = useState('');
  const [draftTarget, setDraftTarget] = useState('');

  const add = useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) =>
      addKeyRemap(source, target),
    onSuccess: (remap) => {
      queryClient.setQueryData(
        queryKeys.keyRemaps,
        (prev: KeyRemapView[] | undefined) => [...(prev ?? []), remap],
      );
      setDraftSource('');
      setDraftTarget('');
      status.set('pass', `Remapped ${remap.source} → ${remap.target}.`);
    },
    onError: (err) => status.set('fail', String(err)),
  });

  const remove = useMutation({
    mutationFn: (source: string) => removeKeyRemap(source),
    onSuccess: (_result, source) => {
      queryClient.setQueryData(
        queryKeys.keyRemaps,
        (prev: KeyRemapView[] | undefined) =>
          prev?.filter((row) => row.source !== source),
      );
      status.set('idle', 'Remap removed.');
    },
    onError: (err) => status.set('fail', String(err)),
  });

  const canAdd = draftSource.length > 0 && draftTarget.length > 0;

  return (
    <Card gap="$3" padding="$3">
      <YStack gap="$1">
        <Label fontSize="$3">Key remaps</Label>
        <MutedText fontSize="$3">
          Press one chord anywhere and Pane sends another. For example, map
          Alt+V to paste with Ctrl+V.
        </MutedText>
      </YStack>

      {remaps.length > 0 ? (
        <YStack gap="$2">
          {remaps.map((row) => (
            <XStack key={row.source} gap="$3" alignItems="center">
              <XStack
                flex={1}
                gap="$2"
                alignItems="center"
                style={{ minWidth: 0 }}
              >
                <Text fontSize="$3" style={{ fontFamily: 'monospace' }}>
                  {row.source}
                </Text>
                <ArrowRight aria-hidden color="$placeholderColor" size={14} />
                <Text fontSize="$3" style={{ fontFamily: 'monospace' }}>
                  {row.target}
                </Text>
              </XStack>
              <Button
                aria-label={`Remove remap ${row.source} to ${row.target}`}
                icon={<Trash2 aria-hidden size={14} />}
                btnScale="sm"
                appearance="secondary"
                disabled={remove.isPending}
                onPress={() => remove.mutate(row.source)}
              >
                Remove
              </Button>
            </XStack>
          ))}
        </YStack>
      ) : null}

      <YStack gap="$2">
        <MutedText fontSize="$2">Add a remap</MutedText>
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          <YStack flex={1} style={{ minWidth: 140 }}>
            <ShortcutInput
              value={draftSource}
              ariaLabel="Remap source shortcut"
              placeholder="Press a chord"
              onCommit={setDraftSource}
              onClear={() => setDraftSource('')}
            />
          </YStack>
          <ArrowRight aria-hidden color="$placeholderColor" size={14} />
          <YStack flex={1} style={{ minWidth: 140 }}>
            <ShortcutInput
              value={draftTarget}
              ariaLabel="Remap target shortcut"
              placeholder="Press a chord"
              onCommit={setDraftTarget}
              onClear={() => setDraftTarget('')}
            />
          </YStack>
          <Button
            icon={<Plus aria-hidden size={14} />}
            btnScale="sm"
            disabled={!canAdd || add.isPending}
            onPress={() =>
              add.mutate({ source: draftSource, target: draftTarget })
            }
          >
            Add
          </Button>
        </XStack>
      </YStack>

      {status.message ? (
        <StatusText status={status.status}>{status.message}</StatusText>
      ) : loadError ? (
        <StatusText status="warn">{loadError}</StatusText>
      ) : null}
    </Card>
  );
}
