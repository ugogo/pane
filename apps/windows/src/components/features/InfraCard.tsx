import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Moon } from '@pane/ui';
import {
  Button,
  Card,
  Label,
  MutedText,
  Switch,
  XStack,
  YStack,
} from '@pane/ui';
import {
  getRunAtStartup,
  setRunAtStartup,
  sleepComputer,
} from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';
import { PageSpinner } from './page-spinner';
import { StatusText } from './status-ui';

export function InfraCard() {
  const queryClient = useQueryClient();
  const startupQuery = useQuery({
    queryKey: queryKeys.runAtStartup,
    queryFn: getRunAtStartup,
  });
  const runAtStartup = startupQuery.data ?? null;
  const startupStatus = useActionStatus();
  const sleepStatus = useActionStatus();

  const startupToggle = useMutation({
    mutationFn: setRunAtStartup,
    onMutate: () => startupStatus.clear(),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.runAtStartup, result.enabled);
      startupStatus.set('pass', 'Startup preference saved.');
    },
    onError: (err) => startupStatus.set('fail', String(err)),
  });

  const sleep = useMutation({
    mutationFn: sleepComputer,
    onMutate: () => sleepStatus.clear(),
    onError: (err) => sleepStatus.set('fail', String(err)),
  });

  if (
    startupQuery.isPending &&
    runAtStartup === null &&
    !startupStatus.message
  ) {
    return <PageSpinner />;
  }

  return (
    <YStack gap="$3">
      <Card padding="$3">
        <XStack gap="$4" alignItems="center" justifyContent="space-between">
          <YStack flex={1} gap="$1">
            <Label fontSize="$3">Start with Windows</Label>
            <MutedText fontSize="$3">
              {__DEV__
                ? 'Disabled in dev so the debug binary is not registered.'
                : 'Keep capture and accents available after sign-in.'}
            </MutedText>
          </YStack>
          <Switch
            aria-label="Run at startup"
            checked={runAtStartup ?? false}
            disabled={runAtStartup === null || __DEV__}
            onCheckedChange={(enabled) => startupToggle.mutate(enabled)}
          />
        </XStack>
      </Card>
      {startupStatus.message ? (
        <StatusText status={startupStatus.status}>
          {startupStatus.message}
        </StatusText>
      ) : null}

      <Card padding="$3">
        <XStack gap="$4" alignItems="center" justifyContent="space-between">
          <YStack flex={1} gap="$1">
            <Label fontSize="$3">Sleep computer</Label>
            <MutedText fontSize="$3">
              Put Windows into sleep mode now.
            </MutedText>
          </YStack>
          <Button
            aria-label="Sleep computer"
            icon={<Moon aria-hidden size={16} />}
            btnScale="sm"
            appearance="secondary"
            onPress={() => sleep.mutate()}
          >
            Sleep
          </Button>
        </XStack>
      </Card>
      {sleepStatus.message ? (
        <StatusText status={sleepStatus.status}>
          {sleepStatus.message}
        </StatusText>
      ) : null}
    </YStack>
  );
}
