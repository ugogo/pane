import { useEffect, useEffectEvent, useState } from 'react';
import { getProcessMetrics, type ProcessMetrics } from '@/lib/commands';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { StatusBadge, StatusText } from './status-ui';

function fmtMb(mb: number) {
  return mb < 1 ? `${Math.round(mb * 1024)} KB` : `${mb.toFixed(1)} MB`;
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function ramStatus(mb: number): 'pass' | 'warn' | 'fail' {
  if (mb < 150) return 'pass';
  if (mb < 300) return 'warn';
  return 'fail';
}

export function MetricsCard({ className }: { className?: string }) {
  const [metrics, setMetrics] = useState<ProcessMetrics | null>(null);
  const [error, setError] = useState<string>();
  const [autoRefresh, setAutoRefresh] = useState(true);

  function refresh() {
    return getProcessMetrics()
      .then((m) => {
        setMetrics(m);
        setError(undefined);
      })
      .catch((err: unknown) => setError(String(err)));
  }

  const onTick = useEffectEvent(() => void refresh());

  useEffect(() => {
    onTick();
    if (!autoRefresh) return;
    const id = setInterval(onTick, 2000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const status = error
    ? 'fail'
    : metrics
      ? ramStatus(metrics.workingSetMb)
      : 'idle';

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Process metrics</CardTitle>
        <CardDescription>
          Memory, startup timing, and process ID.
        </CardDescription>
        <CardAction>
          <StatusBadge status={status} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <StatusText status="fail">{error}</StatusText>
        ) : metrics ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Working set" value={fmtMb(metrics.workingSetMb)} />
            <Stat label="Virtual mem" value={fmtMb(metrics.virtualMemoryMb)} />
            <Stat
              label="Startup elapsed"
              value={fmtMs(metrics.startupElapsedMs)}
            />
            <Stat label="PID" value={String(metrics.pid)} />
          </div>
        ) : (
          <StatusText status="idle">Fetching</StatusText>
        )}

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => void refresh()}>
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
      </CardContent>
    </Card>
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
