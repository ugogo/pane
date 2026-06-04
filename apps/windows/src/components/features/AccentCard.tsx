import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAccentPopupEnabled, setAccentPopupEnabled } from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { PageSpinner } from './page-spinner';
import { StatusText } from './status-ui';

export function AccentCard({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const enabledQuery = useQuery({
    queryKey: queryKeys.accentEnabled,
    queryFn: getAccentPopupEnabled,
  });
  const enabled = enabledQuery.data ?? null;
  const [error, setError] = useState<string>();

  async function handleToggle(next: boolean) {
    setError(undefined);
    const prev = enabledQuery.data;
    queryClient.setQueryData(queryKeys.accentEnabled, next);
    try {
      await setAccentPopupEnabled(next);
    } catch (err) {
      queryClient.setQueryData(queryKeys.accentEnabled, prev);
      setError(String(err));
    }
  }

  if (enabledQuery.isPending && enabled === null && !error) {
    return <PageSpinner className={className} />;
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Enabled</p>
          <p className="text-muted-foreground text-sm">
            Choose variants with click, number keys, or Esc to dismiss.
          </p>
        </div>
        <Switch
          aria-label="Enable long-press accents"
          disabled={enabled === null}
          checked={enabled ?? false}
          onCheckedChange={(checked) => void handleToggle(checked)}
        />
      </div>
      {error && <StatusText status="fail">{error}</StatusText>}
    </div>
  );
}
