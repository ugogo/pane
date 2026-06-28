import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { CopyIcon, QrCodeIcon, WifiIcon, XIcon } from 'lucide-react';
import { Button, Card, Switch, Text, XStack, YStack } from 'pickle-ui';
import { WebQRCode } from '@/components/WebQRCode';
import { PageSpinner } from '@/components/features/page-spinner';
import { PageSection } from '@/components/page-section';
import { PageStatus } from '@/components/page-status';
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
      <PageStatus status={actionStatus.status}>
        {actionStatus.message}
      </PageStatus>
      <PageStatus status="fail">{statusError}</PageStatus>

      <PageSection title="Service">
        <Card>
          <Card.Content>
            <XStack align="center" gap={4} justify="between">
              <div className="min-w-0 flex-1">
                <YStack gap={1}>
                  <Text as="h2" weight="bold">
                    Local companion
                  </Text>
                  <Text tone="muted" truncate>
                    {status
                      ? `${status.serviceName} · ${status.serviceType}`
                      : 'Loading companion state'}
                  </Text>
                </YStack>
              </div>
              <Switch
                checked={status?.enabled ?? false}
                disabled={!status || busy}
                label=""
                onCheckedChange={(checked) =>
                  void update(() => setCompanionEnabled(checked))
                }
              />
            </XStack>
          </Card.Content>
        </Card>
      </PageSection>

      <PageSection title="Pairing">
        <Card>
          <Card.Content>
            <XStack align="center" gap={4} justify="between">
              <div className="min-w-0 flex-1">
                <YStack gap={1}>
                  <Text as="h2" weight="bold">
                    Pairing session
                  </Text>
                  <Text tone="muted">
                    {pairing
                      ? `Expires at ${formatExpiry(pairing.expiresAt)}`
                      : 'No active pairing window'}
                  </Text>
                </YStack>
              </div>
              <div className="shrink-0">
                <XStack gap={2}>
                  {pairing ? (
                    <Button
                      aria-label="Cancel pairing"
                      disabled={busy}
                      variant="outline"
                      onClick={() => void update(cancelCompanionPairing)}
                    >
                      <XIcon aria-hidden size={16} />
                    </Button>
                  ) : null}
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => void update(startCompanionPairing)}
                  >
                    <QrCodeIcon aria-hidden size={16} />
                    Pair
                  </Button>
                </XStack>
              </div>
            </XStack>

            {pairing ? (
              <div className="mt-3 rounded-lg border border-border bg-muted p-3">
                <XStack align="center" gap={3} justify="between">
                  <Text as="h3" weight="bold">
                    Scan to pair
                  </Text>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard.writeText(pairing.pairingUri)
                    }
                  >
                    <CopyIcon aria-hidden size={16} />
                    Copy URI
                  </Button>
                </XStack>
                <div className="mt-3">
                  <XStack justify="center">
                    <WebQRCode
                      level="M"
                      quietZone={0}
                      size={176}
                      value={pairing.pairingUri}
                    />
                  </XStack>
                </div>
                <div className="mt-2 text-center">
                  <Text tone="muted">
                    Open Pane Companion on your iPhone and scan this code.
                  </Text>
                </div>
              </div>
            ) : null}
          </Card.Content>
        </Card>
      </PageSection>

      <PageSection title="Trusted devices">
        <Card>
          <Card.Content>
            <XStack align="center" gap={2}>
              <WifiIcon
                aria-hidden
                className="text-muted-foreground"
                size={14}
              />
              <Text as="h2" weight="bold">
                Trusted devices
              </Text>
            </XStack>

            {devices.length === 0 ? (
              <div className="mt-3">
                <Text tone="muted">No iPhones paired yet.</Text>
              </div>
            ) : (
              <div className="mt-3">
                <YStack gap={2}>
                  {devices.map((device) => (
                    <XStack key={device.id} align="center" gap={2}>
                      <div className="min-w-0 flex-1">
                        <Text weight="bold" truncate>
                          {device.name}
                        </Text>
                        <Text tone="muted">{device.role}</Text>
                      </div>
                      <Button
                        disabled={busy}
                        variant="outline"
                        onClick={() =>
                          void update(() => revokeCompanionDevice(device.id))
                        }
                      >
                        Revoke
                      </Button>
                    </XStack>
                  ))}
                </YStack>
              </div>
            )}
          </Card.Content>
        </Card>
      </PageSection>
    </YStack>
  );
}
