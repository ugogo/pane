import { useEffect, useState } from 'react';
import { Copy, QrCode, Wifi, X } from 'lucide-react';
import {
  cancelCompanionPairing,
  getCompanionStatus,
  revokeCompanionDevice,
  setCompanionEnabled,
  startCompanionPairing,
  type CompanionStatus,
} from '@/lib/commands';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { PageSpinner } from './page-spinner';
import { StatusBadge, StatusText } from './status-ui';

type LoadState = 'busy' | 'ready' | 'error';

function formatExpiry(expiresAt: number) {
  return new Date(expiresAt * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CompanionCard({ className }: { className?: string }) {
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('busy');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void getCompanionStatus()
      .then((next) => {
        setStatus(next);
        setLoadState('ready');
      })
      .catch((err: unknown) => {
        setMessage(String(err));
        setLoadState('error');
      });
  }, []);

  async function update(action: () => Promise<CompanionStatus>) {
    setLoadState('busy');
    setMessage('');

    try {
      const next = await action();
      setStatus(next);
      setLoadState('ready');
    } catch (err) {
      setMessage(String(err));
      setLoadState('error');
    }
  }

  if (status === null && loadState === 'busy') {
    return <PageSpinner className={className} />;
  }

  const pairing = status?.activePairing ?? null;
  const devices = status?.pairedDevices ?? [];
  const busy = loadState === 'busy';

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Local companion</p>
            <StatusBadge status={status?.enabled ? 'pass' : 'disabled'} />
          </div>
          <p className="text-muted-foreground truncate text-sm">
            {status
              ? `${status.serviceName} · ${status.serviceType}`
              : 'Loading companion state'}
          </p>
        </div>
        <Switch
          aria-label="Enable mobile companion"
          disabled={!status || busy}
          checked={status?.enabled ?? false}
          onCheckedChange={(checked) =>
            void update(() => setCompanionEnabled(checked))
          }
        />
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Pairing session</p>
            <p className="text-muted-foreground text-sm">
              {pairing
                ? `Expires at ${formatExpiry(pairing.expiresAt)}`
                : 'No active pairing window'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {pairing ? (
              <Button
                aria-label="Cancel pairing"
                disabled={busy}
                size="icon-sm"
                variant="outline"
                onClick={() => void update(cancelCompanionPairing)}
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
            <Button
              disabled={busy}
              size="sm"
              onClick={() => void update(startCompanionPairing)}
            >
              <QrCode aria-hidden="true" />
              Pair
            </Button>
          </div>
        </div>

        {pairing ? (
          <div className="bg-muted rounded-md p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Pairing URI</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard.writeText(pairing.pairingUri)
                }
              >
                <Copy aria-hidden="true" />
                Copy
              </Button>
            </div>
            <p className="text-muted-foreground font-mono text-[11px] leading-5 break-all">
              {pairing.pairingUri}
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <Wifi aria-hidden="true" className="text-muted-foreground size-3.5" />
          <p className="text-sm font-medium">Trusted devices</p>
        </div>

        {devices.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No iPhones paired yet.
          </p>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => (
              <div
                key={device.id}
                className="bg-muted/50 flex items-center justify-between gap-3 rounded-md px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{device.name}</p>
                  <p className="text-muted-foreground text-xs">{device.role}</p>
                </div>
                <Button
                  disabled={busy}
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void update(() => revokeCompanionDevice(device.id))
                  }
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {message ? (
        <StatusText status={loadState === 'error' ? 'fail' : 'idle'}>
          {message}
        </StatusText>
      ) : null}
    </div>
  );
}
