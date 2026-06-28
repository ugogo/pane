import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Button, Card, Grid, Switch, Text, XStack, YStack } from 'pickle-ui';
import { PageSpinner } from '@/components/features/page-spinner';
import { PageStatus } from '@/components/page-status';
import { getProcessMetrics } from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';

function fmtMb(mb: number) {
  return mb < 1 ? `${Math.round(mb * 1024)} KB` : `${mb.toFixed(1)} MB`;
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export const Route = createFileRoute('/diagnostics')({
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
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
    <YStack gap={4}>
      <Text tone="muted">
        Live process metrics for the running Pane instance.
      </Text>

      <PageStatus status="fail">{error}</PageStatus>

      <XStack align="center" gap={3} wrap="wrap">
        <Button
          variant="outline"
          disabled={metricsQuery.isFetching}
          onClick={() => void metricsQuery.refetch()}
        >
          Refresh
        </Button>
        <Switch
          checked={autoRefresh}
          label="Auto-refresh"
          onCheckedChange={setAutoRefresh}
        />
      </XStack>

      {metrics ? (
        <Card>
          <Card.Content>
            <Grid
              className="grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]"
              gap={3}
            >
              <Metric label="Working set" value={fmtMb(metrics.workingSetMb)} />
              <Metric
                label="Virtual mem"
                value={fmtMb(metrics.virtualMemoryMb)}
              />
              <Metric
                label="Startup elapsed"
                value={fmtMs(metrics.startupElapsedMs)}
              />
              <Metric label="PID" value={String(metrics.pid)} />
            </Grid>
          </Card.Content>
        </Card>
      ) : null}
    </YStack>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-36 flex-1 rounded-lg border border-border bg-muted p-3">
      <Text tone="muted">{label}</Text>
      <div className="mt-1">
        <Text variant="code" weight="bold">
          {value}
        </Text>
      </div>
    </div>
  );
}
