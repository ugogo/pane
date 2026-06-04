import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProcessMetrics } from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { PageSpinner } from './page-spinner';
import { StatusText } from './status-ui';

function fmtMb(mb: number) {
  return mb < 1 ? `${Math.round(mb * 1024)} KB` : `${mb.toFixed(1)} MB`;
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function MetricsCard({ className }: { className?: string }) {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const metricsQuery = useQuery({
    queryKey: queryKeys.metrics,
    queryFn: getProcessMetrics,
    refetchInterval: autoRefresh ? 2000 : false,
  });
  const metrics = metricsQuery.data ?? null;
  const error =
    metricsQuery.error === null || metricsQuery.error === undefined
      ? undefined
      : String(metricsQuery.error);

  if (metricsQuery.isPending && !metrics && !error) {
    return <PageSpinner className={className} />;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {error ? <StatusText status="fail">{error}</StatusText> : null}
      {metrics ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Working set" value={fmtMb(metrics.workingSetMb)} />
          <Stat label="Virtual mem" value={fmtMb(metrics.virtualMemoryMb)} />
          <Stat
            label="Startup elapsed"
            value={fmtMs(metrics.startupElapsedMs)}
          />
          <Stat label="PID" value={String(metrics.pid)} />
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => void metricsQuery.refetch()}>
          Refresh
        </Button>
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Switch
            id="process-metrics-auto-refresh"
            aria-label="Auto-refresh process metrics"
            checked={autoRefresh}
            onCheckedChange={setAutoRefresh}
          />
          <label htmlFor="process-metrics-auto-refresh">Auto-refresh</label>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 font-mono text-sm font-medium">{value}</div>
    </div>
  );
}
