import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Card, Switch, Text, XStack, YStack } from 'pickle-ui';
import { PageSpinner } from '@/components/features/page-spinner';
import { StatusText } from '@/components/features/status-ui';
import { getAccentPopupEnabled, setAccentPopupEnabled } from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';

export const Route = createFileRoute('/accent')({
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
    <YStack gap={4}>
      <Card>
        <Card.Content>
          <XStack align="center" gap={4} justify="between">
            <div className="min-w-0 flex-1">
              <YStack gap={1}>
                <Text as="h2" weight="bold">
                  Enabled
                </Text>
                <Text tone="muted">
                  Choose variants with click, number keys, or Esc to dismiss.
                </Text>
              </YStack>
            </div>
            <Switch
              checked={enabled ?? false}
              disabled={enabled === null}
              label=""
              onCheckedChange={(next) => toggle.mutate(next)}
            />
          </XStack>
        </Card.Content>
      </Card>
      {status.message ? (
        <StatusText status={status.status}>{status.message}</StatusText>
      ) : enabledError ? (
        <StatusText status="fail">{enabledError}</StatusText>
      ) : null}
    </YStack>
  );
}
