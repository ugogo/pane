import { useEffect, useRef, useState } from 'react';
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

type ProbeStatus = 'idle' | 'pass' | 'warn' | 'fail';

const statusStyles: Record<ProbeStatus, string> = {
  idle: 'bg-neutral-100 text-neutral-600',
  pass: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-800',
  fail: 'bg-rose-100 text-rose-800',
};

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
  return [...devices].sort((a, b) => {
    const fa = favs.has(a.id) ? 0 : 1;
    const fb = favs.has(b.id) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return a.name.localeCompare(b.name);
  });
}

export function SoundCard() {
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputVol, setOutputVol] = useState<VolumeInfo | null>(null);
  const [inputVol, setInputVol] = useState<VolumeInfo | null>(null);
  const [favorites, setFavorites] = useState<Record<Kind, Set<string>>>(() => ({
    output: readFavorites('output'),
    input: readFavorites('input'),
  }));
  const [status, setStatus] = useState<ProbeStatus>('idle');
  const [message, setMessage] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const timers = useRef<
    Record<Kind, ReturnType<typeof setTimeout> | undefined>
  >({
    output: undefined,
    input: undefined,
  });

  async function load() {
    setBusy(true);
    setStatus('idle');
    try {
      const [out, inp] = await Promise.all([
        listOutputDevices(),
        listInputDevices(),
      ]);
      setOutputDevices(out);
      setInputDevices(inp);
      // A missing default endpoint (e.g. no input device) shouldn't sink the
      // whole load, so read each volume independently.
      try {
        setOutputVol(await getOutputVolume());
      } catch {
        setOutputVol(null);
      }
      try {
        setInputVol(await getInputVolume());
      } catch {
        setInputVol(null);
      }
      if (out.length === 0 && inp.length === 0) {
        setStatus('warn');
        setMessage('No audio devices found.');
      } else {
        setStatus('pass');
        setMessage(
          `${out.length} output, ${inp.length} input device${
            out.length + inp.length === 1 ? '' : 's'
          }.`,
        );
      }
    } catch (e) {
      setStatus('fail');
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // The backend pushes volume/mute changes (media keys, mixer, other apps) and
  // device changes as events, so we never poll. A pending debounce timer means
  // the user is dragging that slider — skip those so we don't clobber the drag.
  useEffect(() => {
    function applyExternal(kind: Kind, next: VolumeInfo) {
      if (timers.current[kind]) return;
      const update = (prev: VolumeInfo | null) =>
        prev &&
        vpct(prev.volume) === vpct(next.volume) &&
        prev.muted === next.muted
          ? prev
          : next;
      if (kind === 'output') setOutputVol(update);
      else setInputVol(update);
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

  function setVolState(kind: Kind, next: VolumeInfo) {
    if (kind === 'output') setOutputVol(next);
    else setInputVol(next);
  }

  function onVolume(kind: Kind, percent: number) {
    const cur = kind === 'output' ? outputVol : inputVol;
    setVolState(kind, { volume: percent / 100, muted: cur?.muted ?? false });
    if (timers.current[kind]) clearTimeout(timers.current[kind]);
    timers.current[kind] = setTimeout(async () => {
      try {
        await setVolumeFor[kind](percent / 100);
      } catch (e) {
        setStatus('fail');
        setMessage(String(e));
      } finally {
        timers.current[kind] = undefined;
      }
    }, WRITE_DEBOUNCE_MS);
  }

  async function onToggleMute(kind: Kind) {
    const cur = kind === 'output' ? outputVol : inputVol;
    if (!cur) return;
    const muted = !cur.muted;
    setVolState(kind, { ...cur, muted });
    try {
      await setMuteFor[kind](muted);
    } catch (e) {
      setStatus('fail');
      setMessage(String(e));
    }
  }

  async function onSelectDevice(kind: Kind, id: string) {
    const devices = kind === 'output' ? outputDevices : inputDevices;
    if (!id || devices.find((d) => d.id === id)?.isDefault) return;
    setBusy(true);
    try {
      await setDefaultFor[kind](id);
      // Re-read so the slider reflects the newly-default device's own volume.
      await load();
    } catch (e) {
      setStatus('fail');
      setMessage(String(e));
      setBusy(false);
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

  function renderSection(
    kind: Kind,
    label: string,
    devices: AudioDevice[],
    vol: VolumeInfo | null,
  ) {
    const muted = vol?.muted ?? false;
    const MuteIcon =
      kind === 'output' ? (muted ? VolumeX : Volume2) : muted ? MicOff : Mic;
    const favs = favorites[kind];
    const ordered = orderDevices(devices, favs);
    return (
      <div className="border-line rounded-md border p-3">
        <p className="text-ink text-sm font-medium">{label}</p>

        {ordered.length === 0 ? (
          <p className="mt-2 text-xs text-neutral-400 italic">No devices.</p>
        ) : (
          <ul className="divide-line border-line mt-2 max-h-40 divide-y overflow-y-auto rounded-md border">
            {ordered.map((d) => {
              const isFav = favs.has(d.id);
              return (
                <li
                  key={d.id}
                  className={`flex items-center gap-2 px-2 py-1.5 ${
                    d.isDefault ? 'bg-accent/10' : ''
                  }`}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onSelectDevice(kind, d.id)}
                    title={
                      d.isDefault
                        ? 'Current default'
                        : `Set as default ${label.toLowerCase()}`
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50"
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        d.isDefault ? 'bg-accent' : 'bg-transparent'
                      }`}
                    />
                    <span
                      className={`truncate text-sm ${
                        d.isDefault
                          ? 'text-ink font-medium'
                          : 'text-neutral-600'
                      }`}
                    >
                      {d.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(kind, d.id)}
                    aria-label={
                      isFav ? `Unfavorite ${d.name}` : `Favorite ${d.name}`
                    }
                    aria-pressed={isFav}
                    title={isFav ? 'Unfavorite' : 'Favorite'}
                    className="shrink-0 rounded p-1 hover:bg-neutral-100"
                  >
                    <Star
                      size={13}
                      aria-hidden
                      fill={isFav ? 'currentColor' : 'none'}
                      className={isFav ? 'text-amber-500' : 'text-neutral-300'}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {vol ? (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void onToggleMute(kind)}
              aria-label={
                muted
                  ? `Unmute ${label.toLowerCase()}`
                  : `Mute ${label.toLowerCase()}`
              }
              title={muted ? 'Unmute' : 'Mute'}
              className={`border-line shrink-0 rounded-md border p-1.5 hover:bg-neutral-50 ${
                muted ? 'text-rose-600' : 'text-neutral-500'
              }`}
            >
              <MuteIcon size={14} aria-hidden />
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
            <span className="w-10 shrink-0 text-right text-xs font-semibold text-neutral-500">
              {muted ? 'Muted' : `${vpct(vol.volume)}%`}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-xs text-neutral-400 italic">
            No volume control available.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="border-line col-span-2 rounded-lg border bg-white/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-ink flex items-center gap-2 text-base font-semibold">
            <Volume2 size={16} className="text-accent" aria-hidden />
            Sound
          </h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            System volume, mute, and default output/input device for the
            speakers and microphone.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[status]}`}
        >
          {status}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          className="border-line rounded-md border bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          onClick={() => void load()}
          title="Re-enumerate audio devices"
        >
          Refresh
        </button>
      </div>

      {message && (
        <p
          className={`mt-2 text-xs ${status === 'fail' ? 'text-rose-600' : 'text-neutral-500'}`}
        >
          {message}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {renderSection('output', 'Output', outputDevices, outputVol)}
        {renderSection('input', 'Input', inputDevices, inputVol)}
      </div>
    </div>
  );
}
