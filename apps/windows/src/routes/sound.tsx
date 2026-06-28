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
import {
  Button,
  Card,
  IconButton,
  ListRow,
  ListRowContent,
  Label,
  MutedText,
  SectionList,
  Slider,
  SliderRow,
  SliderValue,
  XStack,
  YStack,
} from '@pane/ui';
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
    <YStack gap="$4">
      <XStack style={{ alignSelf: 'flex-start' }}>
        <Button
          disabled={busy}
          btnScale="sm"
          appearance="outline"
          onPress={() => void soundQuery.refetch()}
        >
          Refresh
        </Button>
      </XStack>

      {scanMessage ? (
        <StatusText status={scanStatus}>{scanMessage}</StatusText>
      ) : null}

      <YStack gap="$3">
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
    <Card gap="$3" padding="$3">
      <Label fontSize="$3">{label}</Label>

      {ordered.length === 0 ? (
        <MutedText fontSize="$2">No devices.</MutedText>
      ) : (
        <SectionList>
          {ordered.map((d, index) => {
            const isFav = favs.has(d.id);
            return (
              <ListRow key={d.id} active={d.isDefault} first={index === 0}>
                <ListRowContent
                  active={d.isDefault}
                  disabled={busy}
                  label={d.name}
                  onPress={() => onSelect(kind, d.id)}
                />
                <IconButton
                  active={isFav}
                  aria-label={isFav ? 'Remove favorite' : 'Add favorite'}
                  disabled={busy}
                  onPress={() => onToggleFavorite(kind, d.id)}
                >
                  <StarIcon
                    aria-hidden
                    fill={isFav ? 'currentColor' : 'none'}
                    size={13}
                  />
                </IconButton>
              </ListRow>
            );
          })}
        </SectionList>
      )}

      {vol ? (
        <SliderRow>
          <IconButton
            aria-label={
              kind === 'output' ? 'Toggle output mute' : 'Toggle input mute'
            }
            onPress={() => onToggleMute(kind)}
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
          </IconButton>
          <Slider
            max={100}
            min={0}
            step={1}
            value={vpct(vol.volume)}
            onChange={(v) => onVolume(kind, v)}
          />
          <SliderValue>{muted ? 'Muted' : `${vpct(vol.volume)}%`}</SliderValue>
        </SliderRow>
      ) : (
        <MutedText fontSize="$2" marginTop="$2">
          No volume control available.
        </MutedText>
      )}
    </Card>
  );
}
