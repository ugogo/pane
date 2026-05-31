import { useEffect, useState } from 'react';
import { getAccentPopupEnabled, setAccentPopupEnabled } from '@/lib/commands';
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

type ProbeStatus = 'idle' | 'pass' | 'fail';

export function AccentCard({ className }: { className?: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void getAccentPopupEnabled()
      .then(setEnabled)
      .catch((err: unknown) => setError(String(err)));
  }, []);

  async function handleToggle(next: boolean) {
    setError(undefined);
    const prev = enabled;
    setEnabled(next);
    try {
      await setAccentPopupEnabled(next);
    } catch (err) {
      setEnabled(prev ?? null);
      setError(String(err));
    }
  }

  const status: ProbeStatus = error
    ? 'fail'
    : enabled === null
      ? 'idle'
      : 'pass';

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Accent popup</CardTitle>
        <CardDescription>Long-press letters for accents.</CardDescription>
        <CardAction>
          <StatusBadge status={status} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
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
      </CardContent>
    </Card>
  );
}
