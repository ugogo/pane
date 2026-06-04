import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Volume2, VolumeX, Mic, MicOff, Star } from 'lucide-react';
import {
  setDefaultOutputDevice,
  setDefaultInputDevice,
  setOutputVolume,
  setInputVolume,
  setOutputMute,
  setInputMute,
  type AudioDevice,
  type VolumeInfo,
} from '../../lib/commands';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { PageSpinner } from './page-spinner';
import { StatusText } from './status-ui';

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
const setMuteFor: Record<Kind, (m: boolean) => Promise<void>> = {
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

export function SoundCard({ className }: { className?: string }) {
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
  // Kinds with a slider write in flight — used to ignore the hardware's own
  // change echoes so they don't clobber an active drag. Lazy-initialized once.
  const pendingRef = useRef<Set<Kind> | undefined>(undefined);
  const pending = (pendingRef.current ??= new Set());
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
    if (pending.has(kind)) return;
    const prev = volumes[kind];
    // Skip no-op echoes so we don't thrash the cache.
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
    pending.add(kind);
    schedule(kind, () => {
      void setVolumeFor[kind](percent / 100)
        .catch((e) => status.set('fail', String(e)))
        .finally(() => pending.delete(kind));
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
    return <PageSpinner className={className} />;
  }

  const scanStatus = status.message ? status.status : (data?.status ?? 'idle');
  const scanMessage = status.message || (data?.message ?? '');

  return (
    <div className={cn('space-y-4', className)}>
      <Button
        disabled={busy}
        size="sm"
        onClick={() => void soundQuery.refetch()}
      >
        Refresh
      </Button>

      {scanMessage && (
        <StatusText status={scanStatus}>{scanMessage}</StatusText>
      )}

      <div className="grid gap-3">
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
      </div>
    </div>
  );
}

interface SectionProps {
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
}: SectionProps) {
  const muted = vol?.muted ?? false;
  const ordered = orderDevices(devices, favs);
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-medium">{label}</p>

      {ordered.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">No devices.</p>
      ) : (
        <ul className="mt-2 max-h-40 divide-y overflow-y-auto rounded-lg border">
          {ordered.map((d) => {
            const isFav = favs.has(d.id);
            return (
              <li
                key={d.id}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 transition-colors',
                  d.isDefault && 'bg-muted',
                )}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSelect(kind, d.id)}
                  title={
                    d.isDefault
                      ? 'Current default'
                      : `Set as default ${label.toLowerCase()}`
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      d.isDefault ? 'bg-accent' : 'bg-transparent',
                    )}
                  />
                  <span
                    className={cn(
                      'truncate text-sm',
                      d.isDefault
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground',
                    )}
                  >
                    {d.name}
                  </span>
                </button>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => onToggleFavorite(kind, d.id)}
                        aria-label={
                          isFav ? `Unfavorite ${d.name}` : `Favorite ${d.name}`
                        }
                        aria-pressed={isFav}
                        className="hover:bg-muted shrink-0 rounded p-1 transition"
                      >
                        <Star
                          size={13}
                          aria-hidden
                          fill={isFav ? 'currentColor' : 'none'}
                          className={
                            isFav ? 'text-foreground' : 'text-muted-foreground'
                          }
                        />
                      </button>
                    }
                  />
                  <TooltipContent>
                    {isFav ? 'Unfavorite' : 'Favorite'}
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      )}

      {vol ? (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onToggleMute(kind)}
            aria-label={
              muted
                ? `Unmute ${label.toLowerCase()}`
                : `Mute ${label.toLowerCase()}`
            }
            title={muted ? 'Unmute' : 'Mute'}
            className={cn(
              'hover:bg-muted shrink-0 rounded-md border p-1.5 transition',
              muted ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {kind === 'output' ? (
              muted ? (
                <VolumeX size={14} aria-hidden />
              ) : (
                <Volume2 size={14} aria-hidden />
              )
            ) : muted ? (
              <MicOff size={14} aria-hidden />
            ) : (
              <Mic size={14} aria-hidden />
            )}
          </button>
          <Slider
            min={0}
            max={100}
            step={1}
            value={vpct(vol.volume)}
            onChange={(e) => onVolume(kind, Number(e.target.value))}
            aria-label={`${label} volume`}
          />
          <span className="text-muted-foreground w-10 shrink-0 text-right text-xs">
            {muted ? 'Muted' : `${vpct(vol.volume)}%`}
          </span>
        </div>
      ) : (
        <p className="text-muted-foreground mt-2 text-xs">
          No volume control available.
        </p>
      )}
    </div>
  );
}
