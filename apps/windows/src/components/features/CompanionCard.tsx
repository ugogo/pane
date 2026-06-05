import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, QrCode, Wifi, X } from '@pane/ui';
import {
  Button,
  Card,
  Label,
  MutedPanel,
  MutedText,
  QRCode,
  Switch,
  Text,
  XStack,
  YStack,
} from '@pane/ui';
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
import { PageSpinner } from './page-spinner';
import { StatusBadge, StatusText } from './status-ui';

function formatExpiry(expiresAt: number) {
  return new Date(expiresAt * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CompanionCard() {
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
    return <PageSpinner />;
  }

  const pairing = status?.activePairing ?? null;
  const devices = status?.pairedDevices ?? [];
  const busy = mutation.isPending || statusQuery.isFetching;

  return (
    <YStack gap="$3">
      <Card padding="$3">
        <XStack gap="$4" alignItems="center" justifyContent="space-between">
          <YStack flex={1} gap="$1" style={{ minWidth: 0 }}>
            <XStack gap="$2" alignItems="center">
              <Label fontSize="$3">Local companion</Label>
              <StatusBadge status={status?.enabled ? 'pass' : 'disabled'} />
            </XStack>
            <MutedText fontSize="$3" numberOfLines={1}>
              {status
                ? `${status.serviceName} · ${status.serviceType}`
                : 'Loading companion state'}
            </MutedText>
          </YStack>
          <Switch
            aria-label="Enable mobile companion"
            checked={status?.enabled ?? false}
            disabled={!status || busy}
            onCheckedChange={(checked) =>
              void update(() => setCompanionEnabled(checked))
            }
          />
        </XStack>
      </Card>

      <Card gap="$3" padding="$3">
        <XStack gap="$3" alignItems="center" justifyContent="space-between">
          <YStack flex={1} style={{ minWidth: 0 }}>
            <Label fontSize="$3">Pairing session</Label>
            <MutedText fontSize="$3">
              {pairing
                ? `Expires at ${formatExpiry(pairing.expiresAt)}`
                : 'No active pairing window'}
            </MutedText>
          </YStack>
          <XStack gap="$2" flexShrink={0}>
            {pairing ? (
              <Button
                aria-label="Cancel pairing"
                disabled={busy}
                icon={<X aria-hidden size={16} />}
                btnScale="sm"
                appearance="outline"
                onPress={() => void update(cancelCompanionPairing)}
              />
            ) : null}
            <Button
              disabled={busy}
              icon={<QrCode aria-hidden size={16} />}
              btnScale="sm"
              appearance="outline"
              onPress={() => void update(startCompanionPairing)}
            >
              Pair
            </Button>
          </XStack>
        </XStack>

        {pairing ? (
          <MutedPanel>
            <XStack gap="$3" alignItems="center" justifyContent="space-between">
              <Label fontSize="$3">Scan to pair</Label>
              <Button
                icon={<Copy aria-hidden size={16} />}
                btnScale="sm"
                appearance="outline"
                onPress={() =>
                  void navigator.clipboard.writeText(pairing.pairingUri)
                }
              >
                Copy URI
              </Button>
            </XStack>
            <YStack alignItems="center" marginTop="$3">
              <QRCode
                level="M"
                quietZone={0}
                size={176}
                value={pairing.pairingUri}
              />
            </YStack>
            <MutedText
              fontSize="$2"
              marginTop="$2"
              style={{ textAlign: 'center' }}
            >
              Open Pane Companion on your iPhone and scan this code.
            </MutedText>
          </MutedPanel>
        ) : null}
      </Card>

      <Card gap="$3" padding="$3">
        <XStack gap="$2" alignItems="center">
          <Wifi aria-hidden color="$placeholderColor" size={14} />
          <Label fontSize="$3">Trusted devices</Label>
        </XStack>

        {devices.length === 0 ? (
          <MutedText fontSize="$3">No iPhones paired yet.</MutedText>
        ) : (
          <YStack gap="$2">
            {devices.map((device) => (
              <XStack key={device.id} gap="$2" alignItems="center">
                <YStack flex={1} minWidth={0}>
                  <Text fontSize="$3" fontWeight="600" numberOfLines={1}>
                    {device.name}
                  </Text>
                  <MutedText fontSize="$2">{device.role}</MutedText>
                </YStack>
                <Button
                  disabled={busy}
                  btnScale="xs"
                  appearance="ghost"
                  onPress={() =>
                    void update(() => revokeCompanionDevice(device.id))
                  }
                >
                  Revoke
                </Button>
              </XStack>
            ))}
          </YStack>
        )}
      </Card>

      {actionStatus.message ? (
        <StatusText status={actionStatus.status}>
          {actionStatus.message}
        </StatusText>
      ) : null}
    </YStack>
  );
}
