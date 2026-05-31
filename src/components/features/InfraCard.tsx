import { useEffect, useState } from 'react';
import { getRunAtStartup, setRunAtStartup } from '@/lib/commands';
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

export function InfraCard({ className }: { className?: string }) {
  const [runAtStartup, setRunAtStartupState] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [startupError, setStartupError] = useState<string>();

  useEffect(() => {
    void getRunAtStartup()
      .then(setRunAtStartupState)
      .catch((err: unknown) => setStartupError(String(err)));
  }, []);

  async function handleStartupToggle(enabled: boolean) {
    setStartupError(undefined);
    setSaved(false);
    try {
      const result = await setRunAtStartup(enabled);
      setRunAtStartupState(result.enabled);
      setSaved(true);
    } catch (err) {
      setStartupError(String(err));
    }
  }

  const startupStatus: ProbeStatus = startupError
    ? 'fail'
    : saved
      ? 'pass'
      : 'idle';

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Startup</CardTitle>
        <CardDescription>Background launch behavior.</CardDescription>
        <CardAction>
          <StatusBadge status={startupStatus} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Start with Windows</p>
            <p className="text-muted-foreground text-sm">
              {import.meta.env.DEV
                ? 'Disabled in dev so the debug binary is not registered.'
                : 'Keep capture and accents available after sign-in.'}
            </p>
          </div>
          <Switch
            aria-label="Run at startup"
            disabled={runAtStartup === null || import.meta.env.DEV}
            checked={runAtStartup ?? false}
            onCheckedChange={(checked) => void handleStartupToggle(checked)}
          />
        </div>
        {saved && (
          <StatusText status="pass">Startup preference saved.</StatusText>
        )}
        {startupError && <StatusText status="fail">{startupError}</StatusText>}
      </CardContent>
    </Card>
  );
}
