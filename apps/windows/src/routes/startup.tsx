import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2Icon, MoonIcon, RefreshCwIcon } from 'lucide-react';
import {
  Button,
  Card,
  Label,
  MutedText,
  Switch,
  XStack,
  YStack,
} from '@pane/ui';
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
      ) : startupError ? (
        <StatusText status="fail">{startupError}</StatusText>
      ) : null}

      <Card gap="$2" padding="$3">
        <XStack gap="$4" alignItems="center" justifyContent="space-between">
          <YStack flex={1} gap="$1">
            <Label fontSize="$3">Software updates</Label>
            <MutedText fontSize="$3">
              Check GitHub Releases for a newer signed version of Pane.
            </MutedText>
          </YStack>
          <Button
            aria-label="Check for updates"
            disabled={
              isChecking || updateBusy || checkState.status === 'skipped'
            }
            icon={
              isChecking ? (
                <Loader2Icon aria-hidden size={16} />
              ) : (
                <RefreshCwIcon aria-hidden size={16} />
              )
            }
            btnScale="sm"
            appearance="secondary"
            onPress={() => void checkNow()}
          >
            {isChecking ? 'Checking' : 'Check for updates'}
          </Button>
        </XStack>
        <UpdateCheckMessage checkState={checkState} notice={updateNotice} />
      </Card>

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
            icon={<MoonIcon aria-hidden size={16} />}
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
