import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Card, Label, MutedText, Switch, XStack, YStack } from '@pane/ui';
import { PageSpinner } from '@/components/features/page-spinner';
import { StatusText } from '@/components/features/status-ui';
import { getAccentPopupEnabled, setAccentPopupEnabled } from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';

export const Route = createFileRoute('/_main/accent')({
  component: AccentPage,
});

function AccentPage() {
  const queryClient = useQueryClient();
  const enabledQuery = useQuery({
    queryKey: queryKeys.accentEnabled,
    queryFn: getAccentPopupEnabled,
  });
  const enabled = enabledQuery.data ?? null;
  const enabledError = enabledQuery.isError
    ? `Could not load accent preference: ${String(enabledQuery.error)}`
    : '';
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
      <Card padding="$3">
        <XStack gap="$4" alignItems="center" justifyContent="space-between">
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
      ) : enabledError ? (
        <StatusText status="fail">{enabledError}</StatusText>
      ) : null}
    </YStack>
  );
}
