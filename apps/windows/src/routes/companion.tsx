import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { CopyIcon, QrCodeIcon, WifiIcon, XIcon } from 'lucide-react';
import { Button, Card, Switch, Text, XStack, YStack } from 'pickle-ui';
import { WebQRCode } from '@/components/WebQRCode';
import { PageSpinner } from '@/components/features/page-spinner';
import { StatusBadge, StatusText } from '@/components/features/status-ui';
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

function formatExpiry(expiresAt: number) {
  return new Date(expiresAt * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const Route = createFileRoute('/companion')({
  component: CompanionPage,
});

function CompanionPage() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: queryKeys.companionStatus,
    queryFn: getCompanionStatus,
    refetchInterval: (query) =>
      query.state.data?.activePairing != null ? 2000 : false,
  });
  const status = statusQuery.data ?? null;
  const statusError = statusQuery.isError
    ? `Could not load companion status: ${String(statusQuery.error)}`
    : '';
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
    return <PageSpinner />;
  }

  const pairing = status?.activePairing ?? null;
  const devices = status?.pairedDevices ?? [];
  const busy = mutation.isPending || statusQuery.isFetching;

  return (
    <YStack gap={4}>
      <Card className="gap-3 py-3">
        <Card.Content className="px-3">
          <XStack align="center" gap={4} justify="between">
            <YStack className="min-w-0 flex-1" gap={1}>
              <XStack align="center" gap={2}>
                <Text as="h2" weight="bold">
                  Local companion
                </Text>
                <StatusBadge status={status?.enabled ? 'pass' : 'disabled'} />
              </XStack>
              <Text className="truncate" tone="muted">
                {status
                  ? `${status.serviceName} · ${status.serviceType}`
                  : 'Loading companion state'}
              </Text>
            </YStack>
            <Switch
              checked={status?.enabled ?? false}
              disabled={!status || busy}
              label="Enable mobile companion"
              labelClassName="sr-only"
              onCheckedChange={(checked) =>
                void update(() => setCompanionEnabled(checked))
              }
            />
          </XStack>
        </Card.Content>
      </Card>

      <Card className="gap-3 py-3">
        <Card.Content className="px-3">
          <XStack align="center" gap={4} justify="between">
            <YStack className="min-w-0 flex-1" gap={1}>
              <Text as="h2" weight="bold">
                Pairing session
              </Text>
              <Text tone="muted">
                {pairing
                  ? `Expires at ${formatExpiry(pairing.expiresAt)}`
                  : 'No active pairing window'}
              </Text>
            </YStack>
            <XStack className="shrink-0" gap={2}>
              {pairing ? (
                <Button
                  aria-label="Cancel pairing"
                  disabled={busy}
                  size="sm"
                  variant="outline"
                  onClick={() => void update(cancelCompanionPairing)}
                >
                  <XIcon aria-hidden size={16} />
                </Button>
              ) : null}
              <Button
                disabled={busy}
                size="sm"
                variant="outline"
                onClick={() => void update(startCompanionPairing)}
              >
                <QrCodeIcon aria-hidden size={16} />
                Pair
              </Button>
            </XStack>
          </XStack>

          {pairing ? (
            <div className="mt-3 rounded-lg border border-border bg-muted p-3">
              <XStack align="center" gap={3} justify="between">
                <Text as="h3" weight="bold">
                  Scan to pair
                </Text>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard.writeText(pairing.pairingUri)
                  }
                >
                  <CopyIcon aria-hidden size={16} />
                  Copy URI
                </Button>
              </XStack>
              <XStack className="mt-3" justify="center">
                <WebQRCode
                  level="M"
                  quietZone={0}
                  size={176}
                  value={pairing.pairingUri}
                />
              </XStack>
              <Text className="mt-2 text-center" tone="muted">
                Open Pane Companion on your iPhone and scan this code.
              </Text>
            </div>
          ) : null}
        </Card.Content>
      </Card>

      <Card className="gap-3 py-3">
        <Card.Content className="px-3">
          <XStack align="center" gap={2}>
            <WifiIcon aria-hidden className="text-muted-foreground" size={14} />
            <Text as="h2" weight="bold">
              Trusted devices
            </Text>
          </XStack>

          {devices.length === 0 ? (
            <Text className="mt-3" tone="muted">
              No iPhones paired yet.
            </Text>
          ) : (
            <YStack className="mt-3" gap={2}>
              {devices.map((device) => (
                <XStack key={device.id} align="center" gap={2}>
                  <div className="min-w-0 flex-1">
                    <Text className="truncate" weight="bold">
                      {device.name}
                    </Text>
                    <Text tone="muted">{device.role}</Text>
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
                </XStack>
              ))}
            </YStack>
          )}
        </Card.Content>
      </Card>

      {actionStatus.message ? (
        <StatusText status={actionStatus.status}>
          {actionStatus.message}
        </StatusText>
      ) : statusError ? (
        <StatusText status="fail">{statusError}</StatusText>
      ) : null}
    </YStack>
  );
}
