import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, MutedText, Stat, Switch, XStack, YStack } from '@pane/ui';
import { getProcessMetrics } from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import { PageSpinner } from './page-spinner';
import { StatusText } from './status-ui';

function fmtMb(mb: number) {
  return mb < 1 ? `${Math.round(mb * 1024)} KB` : `${mb.toFixed(1)} MB`;
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function MetricsCard() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const metricsQuery = useQuery({
    queryKey: queryKeys.metrics,
    queryFn: getProcessMetrics,
    refetchInterval: autoRefresh ? 2000 : false,
  });
  const metrics = metricsQuery.data ?? null;
  const error = metricsQuery.error ? String(metricsQuery.error) : undefined;

  if (metricsQuery.isPending && !metrics && !error) {
    return <PageSpinner />;
  }

  return (
    <YStack gap="$4">
      {error ? <StatusText status="fail">{error}</StatusText> : null}
      {metrics ? (
        <XStack flexWrap="wrap" gap="$3">
          <Stat label="Working set" value={fmtMb(metrics.workingSetMb)} />
          <Stat label="Virtual mem" value={fmtMb(metrics.virtualMemoryMb)} />
          <Stat
            label="Startup elapsed"
            value={fmtMs(metrics.startupElapsedMs)}
          />
          <Stat label="PID" value={String(metrics.pid)} />
        </XStack>
      ) : null}

      <XStack gap="$3" alignItems="center">
        <Button
          btnScale="sm"
          appearance="outline"
          onPress={() => void metricsQuery.refetch()}
        >
          Refresh
        </Button>
        <XStack gap="$2" alignItems="center">
          <Switch
            aria-label="Auto-refresh process metrics"
            checked={autoRefresh}
            onCheckedChange={setAutoRefresh}
          />
          <MutedText fontSize="$3">Auto-refresh</MutedText>
        </XStack>
      </XStack>
    </YStack>
  );
}
