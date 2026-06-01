import { useEffect, useReducer, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Volume2, VolumeX, Mic, MicOff, Star } from 'lucide-react';
import {
  listOutputDevices,
  listInputDevices,
  setDefaultOutputDevice,
  setDefaultInputDevice,
  getOutputVolume,
  getInputVolume,
  setOutputVolume,
  setInputVolume,
  setOutputMute,
  setInputMute,
  type AudioDevice,
  type VolumeInfo,
} from '../../lib/commands';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageSpinner } from './page-spinner';
import { StatusText } from './status-ui';

type ProbeStatus = 'idle' | 'pass' | 'warn' | 'fail';

// Avoid flooding the endpoint with a write on every pixel of slider drag.
const WRITE_DEBOUNCE_MS = 100;

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

// A missing default endpoint (e.g. no input device) shouldn't sink the whole
// load, so a failed read just yields null.
function readVolume(
  read: () => Promise<VolumeInfo>,
): Promise<VolumeInfo | null> {
  return read().catch(() => null);
}

function favKey(kind: Kind) {
  return `pane.audio.favorites.${kind}`;
}

function readFavorites(kind: Kind): Set<string> {
  try {
    const raw = localStorage.getItem(favKey(kind));
    if (!raw) return new Set();
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr)
      ? new Set(arr.filter((x): x is string => typeof x === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

// Favorites float to the top; everything else stays alphabetical.
function orderDevices(
  devices: AudioDevice[],
  favs: Set<string>,
): AudioDevice[] {
  return devices.toSorted((a, b) => {
    const fa = favs.has(a.id) ? 0 : 1;
    const fb = favs.has(b.id) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return a.name.localeCompare(b.name);
  });
}

interface State {
  devices: Record<Kind, AudioDevice[]>;
  volumes: Record<Kind, VolumeInfo | null>;
  status: ProbeStatus;
  message: string;
  busy: boolean;
}

type Action =
  | { type: 'beginLoad' }
  | {
      type: 'loaded';
      devices: Record<Kind, AudioDevice[]>;
      volumes: Record<Kind, VolumeInfo | null>;
      status: ProbeStatus;
      message: string;
    }
  | { type: 'loadFailed'; message: string }
  | { type: 'setVolume'; kind: Kind; info: VolumeInfo }
  | { type: 'externalVolume'; kind: Kind; info: VolumeInfo }
  | { type: 'notify'; status: ProbeStatus; message: string };

const initialState: State = {
  devices: { output: [], input: [] },
  volumes: { output: null, input: null },
  status: 'idle',
  message: '',
  // Starts true because we enumerate devices on mount.
  busy: true,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'beginLoad':
      return { ...state, busy: true, status: 'idle' };
    case 'loaded':
      return {
        ...state,
        devices: action.devices,
        volumes: action.volumes,
        status: action.status,
        message: action.message,
        busy: false,
      };
    case 'loadFailed':
      return { ...state, status: 'fail', message: action.message, busy: false };
    case 'setVolume':
      return {
        ...state,
        volumes: { ...state.volumes, [action.kind]: action.info },
      };
    case 'externalVolume': {
      // Skip no-op echoes so we don't clobber an in-progress drag.
      const prev = state.volumes[action.kind];
      if (
        prev &&
        vpct(prev.volume) === vpct(action.info.volume) &&
        prev.muted === action.info.muted
      ) {
        return state;
      }
      return {
        ...state,
        volumes: { ...state.volumes, [action.kind]: action.info },
      };
    }
    case 'notify':
      return { ...state, status: action.status, message: action.message };
  }
}

export function SoundCard({ className }: { className?: string }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { devices, volumes, status, message, busy } = state;
  const [favorites, setFavorites] = useState<Record<Kind, Set<string>>>(() => ({
    output: readFavorites('output'),
    input: readFavorites('input'),
  }));
  const timers = useRef<
    Record<Kind, ReturnType<typeof setTimeout> | undefined>
  >({
    output: undefined,
    input: undefined,
  });

  // All state updates live in deferred promise callbacks, so this is safe to
  // call straight from an effect without tripping set-state-in-effect.
  function load() {
    return Promise.all([listOutputDevices(), listInputDevices()])
      .then(async ([out, inp]) => {
        const [outputVol, inputVol] = await Promise.all([
          readVolume(getOutputVolume),
          readVolume(getInputVolume),
        ]);
        const empty = out.length === 0 && inp.length === 0;
        dispatch({
          type: 'loaded',
          devices: { output: out, input: inp },
          volumes: { output: outputVol, input: inputVol },
          status: empty ? 'warn' : 'pass',
          message: empty
            ? 'No audio devices found.'
            : `${out.length} output, ${inp.length} input device${
                out.length + inp.length === 1 ? '' : 's'
              }.`,
        });
      })
      .catch((e: unknown) =>
        dispatch({ type: 'loadFailed', message: String(e) }),
      );
  }

  useEffect(() => {
    void load();
  }, []);

  // The backend pushes volume/mute changes (media keys, mixer, other apps) and
  // device changes as events, so we never poll. A pending debounce timer means
  // the user is dragging that slider — skip those so we don't clobber the drag.
  useEffect(() => {
    function applyExternal(kind: Kind, info: VolumeInfo) {
      if (timers.current[kind]) return;
      dispatch({ type: 'externalVolume', kind, info });
    }
    const volSub = listen<VolumeChange>('audio-volume-changed', (e) => {
      applyExternal(e.payload.kind, {
        volume: e.payload.volume,
        muted: e.payload.muted,
      });
    });
    const devSub = listen('audio-devices-changed', () => void load());
    return () => {
      void volSub.then((un) => un());
      void devSub.then((un) => un());
    };
  }, []);

  function onVolume(kind: Kind, percent: number) {
    const cur = volumes[kind];
    dispatch({
      type: 'setVolume',
      kind,
      info: { volume: percent / 100, muted: cur?.muted ?? false },
    });
    if (timers.current[kind]) clearTimeout(timers.current[kind]);
    timers.current[kind] = setTimeout(async () => {
      try {
        await setVolumeFor[kind](percent / 100);
      } catch (e) {
        dispatch({ type: 'notify', status: 'fail', message: String(e) });
      } finally {
        timers.current[kind] = undefined;
      }
    }, WRITE_DEBOUNCE_MS);
  }

  async function onToggleMute(kind: Kind) {
    const cur = volumes[kind];
    if (!cur) return;
    const muted = !cur.muted;
    dispatch({ type: 'setVolume', kind, info: { ...cur, muted } });
    try {
      await setMuteFor[kind](muted);
    } catch (e) {
      dispatch({ type: 'notify', status: 'fail', message: String(e) });
    }
  }

  async function onSelectDevice(kind: Kind, id: string) {
    if (!id || devices[kind].find((d) => d.id === id)?.isDefault) return;
    dispatch({ type: 'beginLoad' });
    try {
      await setDefaultFor[kind](id);
      // Re-read so the slider reflects the newly-default device's own volume.
      await load();
    } catch (e) {
      dispatch({ type: 'loadFailed', message: String(e) });
    }
  }

  function toggleFavorite(kind: Kind, id: string) {
    setFavorites((prev) => {
      const next = new Set(prev[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(favKey(kind), JSON.stringify([...next]));
      } catch {
        /* storage unavailable; favorites just won't persist */
      }
      return { ...prev, [kind]: next };
    });
  }

  const isInitialLoad =
    busy &&
    !message &&
    devices.output.length === 0 &&
    devices.input.length === 0 &&
    volumes.output === null &&
    volumes.input === null;

  if (isInitialLoad) {
    return <PageSpinner className={className} />;
  }

  return (
    <div className={cn('space-y-4', className)}>
      <Button
        disabled={busy}
        size="sm"
        onClick={() => {
          dispatch({ type: 'beginLoad' });
          void load();
        }}
      >
        Refresh
      </Button>

      {message && <StatusText status={status}>{message}</StatusText>}

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
                className={`flex items-center gap-2 px-2 py-1.5 transition-colors ${
                  d.isDefault ? 'bg-muted' : ''
                }`}
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
                    className={`size-1.5 shrink-0 rounded-full ${
                      d.isDefault ? 'bg-accent' : 'bg-transparent'
                    }`}
                  />
                  <span
                    className={`truncate text-sm ${
                      d.isDefault
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground'
                    }`}
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
            className={`hover:bg-muted shrink-0 rounded-md border p-1.5 transition ${
              muted ? 'text-destructive' : 'text-muted-foreground'
            }`}
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
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={vpct(vol.volume)}
            onChange={(e) => onVolume(kind, Number(e.target.value))}
            aria-label={`${label} volume`}
            className="w-full"
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
