import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Card, Switch, Text, XStack, YStack } from 'pickle-ui';
import { PageSpinner } from '@/components/features/page-spinner';
import { PageStatus } from '@/components/page-status';
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
      <PageStatus status={status.status}>{status.message}</PageStatus>
      <PageStatus status="fail">{enabledError}</PageStatus>

      <div className="rounded-lg border border-border bg-muted p-4">
        <YStack gap={2}>
          <Text weight="bold">How accents work</Text>
          <Text tone="muted">
            Long-press a letter key anywhere in Windows to open the accent
            picker. Example: hold{' '}
            <Text as="span" variant="code">
              a
            </Text>{' '}
            to choose{' '}
            <Text as="span" variant="code">
              à
            </Text>
            ,{' '}
            <Text as="span" variant="code">
              â
            </Text>
            , or{' '}
            <Text as="span" variant="code">
              ä
            </Text>
            .
          </Text>
          <Text tone="muted">
            Press number keys{' '}
            <Text as="span" variant="code">
              1
            </Text>
            ,{' '}
            <Text as="span" variant="code">
              2
            </Text>
            , or{' '}
            <Text as="span" variant="code">
              3
            </Text>{' '}
            to pick a variant, or{' '}
            <Text as="span" variant="code">
              Esc
            </Text>{' '}
            to dismiss without typing.
          </Text>
        </YStack>
      </div>

      <Card>
        <Card.Content>
          <XStack align="center" gap={4} justify="between">
            <div className="min-w-0 flex-1">
              <YStack gap={1}>
                <Text as="h2" weight="bold">
                  Enabled
                </Text>
                <Text tone="muted">
                  Turn the accent popup on or off system-wide.
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
    </YStack>
  );
}
