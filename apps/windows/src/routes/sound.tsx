import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  MicIcon,
  MicOffIcon,
  StarIcon,
  Volume2Icon,
  VolumeXIcon,
} from 'lucide-react';
import { Button, Card, Slider, Text, XStack, YStack } from 'pickle-ui';
import { PageSpinner } from '@/components/features/page-spinner';
import { StatusText } from '@/components/features/status-ui';
import {
  setDefaultOutputDevice,
  setDefaultInputDevice,
  setOutputVolume,
  setInputVolume,
  setOutputMute,
  setInputMute,
  type AudioDevice,
  type VolumeInfo,
} from '@/lib/commands';
import {
  orderDevices,
  readFavorites,
  writeFavorites,
} from '@/lib/audio-favorites';
import { fetchSound, type SoundQueryData } from '@/lib/sound-query';
import { queryKeys } from '@/lib/query-keys';
import { useActionStatus } from '@/lib/use-action-status';
import { useDebouncedWrite } from '@/lib/use-debounced-write';
import { useTauriEvent } from '@/lib/use-tauri-event';

type Kind = 'output' | 'input';

interface VolumeChange {
  kind: Kind;
  volume: number;
  muted: boolean;
}

const setVolumeFor: Record<Kind, (v: number) => Promise<void>> = {
  output: setOutputVolume,
  input: setInputVolume,
};
const setMuteFor: Record<Kind, (muted: boolean) => Promise<void>> = {
  output: setOutputMute,
  input: setInputMute,
};
const setDefaultFor: Record<Kind, (id: string) => Promise<void>> = {
  output: setDefaultOutputDevice,
  input: setDefaultInputDevice,
};

function vpct(volume: number) {
  return Math.round(volume * 100);
}

const emptyDevices = {
  output: [] as AudioDevice[],
  input: [] as AudioDevice[],
};
const emptyVolumes = { output: null, input: null };

export const Route = createFileRoute('/sound')({
  component: SoundPage,
});

function SoundPage() {
  const queryClient = useQueryClient();
  const soundQuery = useQuery({
    queryKey: queryKeys.sound,
    queryFn: fetchSound,
  });
  const data = soundQuery.data;
  const devices = data?.devices ?? emptyDevices;
  const volumes = data?.volumes ?? emptyVolumes;

  const status = useActionStatus();
  const schedule = useDebouncedWrite();
  const [favorites, setFavorites] = useState<Record<Kind, Set<string>>>(() => ({
    output: readFavorites('output'),
    input: readFavorites('input'),
  }));

  function patchVolume(kind: Kind, info: VolumeInfo) {
    queryClient.setQueryData(
      queryKeys.sound,
      (prev: SoundQueryData | undefined) =>
        prev ? { ...prev, volumes: { ...prev.volumes, [kind]: info } } : prev,
    );
  }

  useTauriEvent<VolumeChange>('audio-volume-changed', (event) => {
    const { kind, volume, muted } = event.payload;
    const prev = volumes[kind];
    if (prev && vpct(prev.volume) === vpct(volume) && prev.muted === muted) {
      return;
    }
    patchVolume(kind, { volume, muted });
  });

  useTauriEvent('audio-devices-changed', () => void soundQuery.refetch());

  const selectDevice = useMutation({
    mutationFn: ({ kind, id }: { kind: Kind; id: string }) =>
      setDefaultFor[kind](id),
    onMutate: () => status.clear(),
    onSuccess: () => void soundQuery.refetch(),
    onError: (err) => status.set('fail', String(err)),
  });

  const busy = soundQuery.isFetching || selectDevice.isPending;

  function onVolume(kind: Kind, percent: number) {
    const cur = volumes[kind];
    patchVolume(kind, { volume: percent / 100, muted: cur?.muted ?? false });
    schedule(kind, () => {
      void setVolumeFor[kind](percent / 100).catch((e) =>
        status.set('fail', String(e)),
      );
    });
  }

  function onToggleMute(kind: Kind) {
    const cur = volumes[kind];
    if (!cur) return;
    const muted = !cur.muted;
    patchVolume(kind, { ...cur, muted });
    void setMuteFor[kind](muted).catch((e) => status.set('fail', String(e)));
  }

  function onSelectDevice(kind: Kind, id: string) {
    if (!id || devices[kind].find((d) => d.id === id)?.isDefault) return;
    selectDevice.mutate({ kind, id });
  }

  function toggleFavorite(kind: Kind, id: string) {
    setFavorites((prev) => {
      const next = new Set(prev[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeFavorites(kind, next);
      return { ...prev, [kind]: next };
    });
  }

  if (soundQuery.isPending && !data) {
    return <PageSpinner />;
  }

  const queryError = soundQuery.isError ? String(soundQuery.error) : '';
  const scanStatus = status.message
    ? status.status
    : queryError
      ? 'fail'
      : (data?.status ?? 'idle');
  const scanMessage = status.message || queryError || (data?.message ?? '');

  return (
    <YStack gap={4}>
      <div>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => void soundQuery.refetch()}
        >
          Refresh
        </Button>
      </div>

      {scanMessage ? (
        <StatusText status={scanStatus}>{scanMessage}</StatusText>
      ) : null}

      <YStack gap={3}>
        <Section
          kind="output"
          label="Output"
          devices={devices.output}
          vol={volumes.output}
          busy={busy}
          favs={favorites.output}
          onSelect={onSelectDevice}
          onToggleMute={onToggleMute}
          onVolume={onVolume}
          onToggleFavorite={toggleFavorite}
        />
        <Section
          kind="input"
          label="Input"
          devices={devices.input}
          vol={volumes.input}
          busy={busy}
          favs={favorites.input}
          onSelect={onSelectDevice}
          onToggleMute={onToggleMute}
          onVolume={onVolume}
          onToggleFavorite={toggleFavorite}
        />
      </YStack>
    </YStack>
  );
}

function Section({
  kind,
  label,
  devices,
  vol,
  busy,
  favs,
  onSelect,
  onToggleMute,
  onVolume,
  onToggleFavorite,
}: {
  kind: Kind;
  label: string;
  devices: AudioDevice[];
  vol: VolumeInfo | null;
  busy: boolean;
  favs: Set<string>;
  onSelect: (kind: Kind, id: string) => void;
  onToggleMute: (kind: Kind) => void;
  onVolume: (kind: Kind, percent: number) => void;
  onToggleFavorite: (kind: Kind, id: string) => void;
}) {
  const muted = vol?.muted ?? false;
  const ordered = orderDevices(devices, favs);
  return (
    <Card>
      <Card.Content>
        <Text as="h2" weight="bold">
          {label}
        </Text>

        {ordered.length === 0 ? (
          <div className="mt-3">
            <Text tone="muted">No devices.</Text>
          </div>
        ) : (
          <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-border">
            {ordered.map((d, index) => {
              const isFav = favs.has(d.id);
              return (
                <div
                  key={d.id}
                  className={`flex items-center gap-2 px-2 py-2 ${index > 0 ? 'border-t border-border' : ''} ${d.isDefault ? 'bg-accent' : ''}`}
                >
                  <button
                    className={`min-w-0 flex-1 truncate text-left text-sm focus-ring rounded-sm ${d.isDefault ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                    disabled={busy}
                    type="button"
                    onClick={() => onSelect(kind, d.id)}
                  >
                    <span className="mr-2 inline-block size-1.5 rounded-full bg-current" />
                    {d.name}
                  </button>
                  <Button
                    aria-label={isFav ? 'Remove favorite' : 'Add favorite'}
                    disabled={busy}
                    variant="ghost"
                    onClick={() => onToggleFavorite(kind, d.id)}
                  >
                    <StarIcon
                      aria-hidden
                      fill={isFav ? 'currentColor' : 'none'}
                      size={13}
                    />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {vol ? (
          <div className="mt-3">
            <XStack align="center" gap={2.5}>
              <Button
                aria-label={
                  kind === 'output' ? 'Toggle output mute' : 'Toggle input mute'
                }
                variant="secondary"
                onClick={() => onToggleMute(kind)}
              >
                {kind === 'output' ? (
                  muted ? (
                    <VolumeXIcon aria-hidden size={14} />
                  ) : (
                    <Volume2Icon aria-hidden size={14} />
                  )
                ) : muted ? (
                  <MicOffIcon aria-hidden size={14} />
                ) : (
                  <MicIcon aria-hidden size={14} />
                )}
              </Button>
              <div className="min-w-0 flex-1">
                <Slider
                  max={100}
                  min={0}
                  step={1}
                  value={[vpct(vol.volume)]}
                  onValueChange={(value) =>
                    onVolume(
                      kind,
                      typeof value === 'number'
                        ? value
                        : (value[0] ?? vpct(vol.volume)),
                    )
                  }
                />
              </div>
              <output className="w-11 shrink-0 text-right text-xs text-muted-foreground">
                {muted ? 'Muted' : `${vpct(vol.volume)}%`}
              </output>
            </XStack>
          </div>
        ) : (
          <div className="mt-2">
            <Text tone="muted">No volume control available.</Text>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
