import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, QrCode, Wifi, X } from 'lucide-react';
import {
  cancelCompanionPairing,
  getCompanionStatus,
  revokeCompanionDevice,
  setCompanionEnabled,
  startCompanionPairing,
  type CompanionStatus,
} from '@/lib/commands';
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { PageSpinner } from './page-spinner';
import { StatusBadge, StatusText } from './status-ui';

function formatExpiry(expiresAt: number) {
  return new Date(expiresAt * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CompanionCard({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: queryKeys.companionStatus,
    queryFn: getCompanionStatus,
    refetchInterval: (query) =>
      query.state.data?.activePairing != null ? 2000 : false,
  });
  const status = statusQuery.data ?? null;
  const actionStatus = useActionStatus();

  const mutation = useMutation({
    mutationFn: (action: () => Promise<CompanionStatus>) => action(),
    onMutate: () => actionStatus.clear(),
    onSuccess: (next) =>
      queryClient.setQueryData(queryKeys.companionStatus, next),
    onError: (err) => actionStatus.set('fail', String(err)),
  });
  const update = (action: () => Promise<CompanionStatus>) =>
    mutation.mutate(action);

  if (statusQuery.isPending && !status) {
    return <PageSpinner className={className} />;
  }

  const pairing = status?.activePairing ?? null;
  const devices = status?.pairedDevices ?? [];
  const busy = mutation.isPending || statusQuery.isFetching;

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
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Scan to pair</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard.writeText(pairing.pairingUri)
                }
              >
                <Copy aria-hidden="true" />
                Copy URI
              </Button>
            </div>
            <div className="flex justify-center">
              <div className="rounded-md bg-white p-3">
                <QRCodeSVG
                  value={pairing.pairingUri}
                  size={176}
                  level="M"
                  marginSize={0}
                />
              </div>
            </div>
            <p className="text-muted-foreground mt-3 text-center text-xs">
              Open Pane Companion on your iPhone and scan this code.
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

      {actionStatus.message ? (
        <StatusText status={actionStatus.status}>
          {actionStatus.message}
        </StatusText>
      ) : null}
    </div>
  );
}
