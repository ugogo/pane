import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Moon } from 'lucide-react';
import {
  getRunAtStartup,
  setRunAtStartup,
  sleepComputer,
} from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { PageSpinner } from './page-spinner';
import { StatusText } from './status-ui';

export function InfraCard({ className }: { className?: string }) {
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
    return <PageSpinner className={className} />;
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Start with Windows</p>
          <p className="text-muted-foreground text-sm">
            {__DEV__
              ? 'Disabled in dev so the debug binary is not registered.'
              : 'Keep capture and accents available after sign-in.'}
          </p>
        </div>
        <Switch
          aria-label="Run at startup"
          disabled={runAtStartup === null || __DEV__}
          checked={runAtStartup ?? false}
          onCheckedChange={(checked) => startupToggle.mutate(checked)}
        />
      </div>
      {startupStatus.message && (
        <StatusText status={startupStatus.status}>
          {startupStatus.message}
        </StatusText>
      )}

      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Sleep computer</p>
          <p className="text-muted-foreground text-sm">
            Put Windows into sleep mode now.
          </p>
        </div>
        <Button
          aria-label="Sleep computer"
          size="sm"
          variant="secondary"
          onClick={() => sleep.mutate()}
        >
          <Moon aria-hidden="true" />
          Sleep
        </Button>
      </div>
      {sleepStatus.message && (
        <StatusText status={sleepStatus.status}>
          {sleepStatus.message}
        </StatusText>
      )}
    </div>
  );
}
