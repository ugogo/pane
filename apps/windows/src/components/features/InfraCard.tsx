import { useEffect, useState } from 'react';
import { getRunAtStartup, setRunAtStartup } from '@/lib/commands';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { PageSpinner } from './page-spinner';
import { StatusText } from './status-ui';

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

  if (runAtStartup === null && !startupError) {
    return <PageSpinner className={className} />;
  }

  return (
    <div className={cn('space-y-3', className)}>
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
    </div>
  );
}
