import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Label, MutedText, Switch, XStack, YStack } from '@pane/ui';
import { getAccentPopupEnabled, setAccentPopupEnabled } from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';
import { PageSpinner } from './page-spinner';
import { StatusText } from './status-ui';

export function AccentCard() {
  const queryClient = useQueryClient();
  const enabledQuery = useQuery({
    queryKey: queryKeys.accentEnabled,
    queryFn: getAccentPopupEnabled,
  });
  const enabled = enabledQuery.data ?? null;
  const status = useActionStatus();

  const toggle = useMutation({
    mutationFn: setAccentPopupEnabled,
    onMutate: (next: boolean) => {
      status.clear();
      const prev = enabledQuery.data;
      queryClient.setQueryData(queryKeys.accentEnabled, next);
      return { prev };
    },
    onError: (err, _next, ctx) => {
      queryClient.setQueryData(queryKeys.accentEnabled, ctx?.prev);
      status.set('fail', String(err));
    },
  });

  if (enabledQuery.isPending && enabled === null && !status.message) {
    return <PageSpinner />;
  }

  return (
    <YStack gap="$3">
      <Card p="$3">
        <XStack gap="$4" items="center" justify="space-between">
          <YStack flex={1} gap="$1">
            <Label fontSize="$3">Enabled</Label>
            <MutedText fontSize="$3">
              Choose variants with click, number keys, or Esc to dismiss.
            </MutedText>
          </YStack>
          <Switch
            aria-label="Enable long-press accents"
            checked={enabled ?? false}
            disabled={enabled === null}
            onCheckedChange={(next) => toggle.mutate(next)}
          />
        </XStack>
      </Card>
      {status.message ? (
        <StatusText status={status.status}>{status.message}</StatusText>
      ) : null}
    </YStack>
  );
}
