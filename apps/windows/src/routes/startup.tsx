import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2Icon, MoonIcon, RefreshCwIcon } from 'lucide-react';
import { Button, Card, Switch, Text, XStack, YStack } from 'pickle-ui';
import { PageSpinner } from '@/components/features/page-spinner';
import { StatusText } from '@/components/features/status-ui';
import {
  getRunAtStartup,
  setRunAtStartup,
  sleepComputer,
} from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';
import { useUpdateCheckContext } from '@/lib/update-check-context';
import type {
  UpdateCheckState,
  UpdateNoticeState,
} from '@/lib/use-update-check';

function UpdateCheckMessage({
  checkState,
  notice,
}: {
  checkState: UpdateCheckState;
  notice: UpdateNoticeState;
}) {
  if (notice.status === 'installing') {
    return (
      <StatusText status="warn">
        Downloading and installing Pane {notice.version}…
      </StatusText>
    );
  }
  if (notice.status === 'installed') {
    return (
      <StatusText status="pass">
        Pane {notice.version} is ready. Restart to finish the update.
      </StatusText>
    );
  }
  if (checkState.status === 'checking') {
    return <StatusText status="warn">Checking for updates…</StatusText>;
  }
  if (checkState.status === 'available') {
    return (
      <StatusText status="warn">
        A new update is available: Pane {checkState.version}.
      </StatusText>
    );
  }
  if (checkState.status === 'current') {
    return <StatusText status="pass">Pane is up to date.</StatusText>;
  }
  if (checkState.status === 'error') {
    return (
      <StatusText status="fail">
        Could not check for updates: {checkState.message}
      </StatusText>
    );
  }
  return (
    <StatusText status="disabled">
      Update checks are unavailable in dev builds.
    </StatusText>
  );
}

export const Route = createFileRoute('/startup')({
  component: StartupPage,
});

function StartupPage() {
  const queryClient = useQueryClient();
  const {
    checkState,
    checkNow,
    notice: updateNotice,
  } = useUpdateCheckContext();
  const startupQuery = useQuery({
    queryKey: queryKeys.runAtStartup,
    queryFn: getRunAtStartup,
  });
  const runAtStartup = startupQuery.data ?? null;
  const startupError = startupQuery.isError
    ? `Could not load startup preference: ${String(startupQuery.error)}`
    : '';
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

  const isChecking = checkState.status === 'checking';
  const updateBusy =
    updateNotice.status === 'installing' || updateNotice.status === 'installed';

  if (
    startupQuery.isPending &&
    runAtStartup === null &&
    !startupStatus.message &&
    !startupError
  ) {
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
                  Start with Windows
                </Text>
                <Text tone="muted">
                  {__DEV__
                    ? 'Disabled in dev so the debug binary is not registered.'
                    : 'Keep capture and accents available after sign-in.'}
                </Text>
              </YStack>
            </div>
            <Switch
              checked={runAtStartup ?? false}
              disabled={runAtStartup === null || __DEV__}
              label=""
              onCheckedChange={(enabled) => startupToggle.mutate(enabled)}
            />
          </XStack>
        </Card.Content>
      </Card>
      {startupStatus.message ? (
        <StatusText status={startupStatus.status}>
          {startupStatus.message}
        </StatusText>
      ) : startupError ? (
        <StatusText status="fail">{startupError}</StatusText>
      ) : null}

      <Card>
        <Card.Content>
          <YStack gap={2}>
            <XStack align="center" gap={4} justify="between">
              <div className="min-w-0 flex-1">
                <YStack gap={1}>
                  <Text as="h2" weight="bold">
                    Software updates
                  </Text>
                  <Text tone="muted">
                    Check GitHub Releases for a newer signed version of Pane.
                  </Text>
                </YStack>
              </div>
              <Button
                aria-label="Check for updates"
                disabled={
                  isChecking || updateBusy || checkState.status === 'skipped'
                }
                variant="secondary"
                onClick={() => void checkNow()}
              >
                {isChecking ? (
                  <Loader2Icon aria-hidden className="animate-spin" size={16} />
                ) : (
                  <RefreshCwIcon aria-hidden size={16} />
                )}
                {isChecking ? 'Checking' : 'Check for updates'}
              </Button>
            </XStack>
            <UpdateCheckMessage checkState={checkState} notice={updateNotice} />
          </YStack>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content>
          <XStack align="center" gap={4} justify="between">
            <div className="min-w-0 flex-1">
              <YStack gap={1}>
                <Text as="h2" weight="bold">
                  Sleep computer
                </Text>
                <Text tone="muted">Put Windows into sleep mode now.</Text>
              </YStack>
            </div>
            <Button variant="secondary" onClick={() => sleep.mutate()}>
              <MoonIcon aria-hidden size={16} />
              Sleep
            </Button>
          </XStack>
        </Card.Content>
      </Card>
      {sleepStatus.message ? (
        <StatusText status={sleepStatus.status}>
          {sleepStatus.message}
        </StatusText>
      ) : null}
    </YStack>
  );
}
