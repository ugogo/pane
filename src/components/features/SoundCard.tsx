import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Mic, MicOff } from "lucide-react";
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
} from "../../lib/commands";

type ProbeStatus = "idle" | "pass" | "warn" | "fail";

const statusStyles: Record<ProbeStatus, string> = {
  idle: "bg-neutral-100 text-neutral-600",
  pass: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  fail: "bg-rose-100 text-rose-800",
};

// Avoid flooding the endpoint with a write on every pixel of slider drag.
const WRITE_DEBOUNCE_MS = 100;

type Kind = "output" | "input";

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

function defaultId(devices: AudioDevice[]) {
  return devices.find((d) => d.isDefault)?.id ?? "";
}

export function SoundCard() {
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputVol, setOutputVol] = useState<VolumeInfo | null>(null);
  const [inputVol, setInputVol] = useState<VolumeInfo | null>(null);
  const [status, setStatus] = useState<ProbeStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const timers = useRef<Record<Kind, ReturnType<typeof setTimeout> | undefined>>({
    output: undefined,
    input: undefined,
  });

  async function load() {
    setBusy(true);
    setStatus("idle");
    try {
      const [out, inp] = await Promise.all([listOutputDevices(), listInputDevices()]);
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
        setStatus("warn");
        setMessage("No audio devices found.");
      } else {
        setStatus("pass");
        setMessage(
          `${out.length} output, ${inp.length} input device${
            out.length + inp.length === 1 ? "" : "s"
          }.`,
        );
      }
    } catch (e) {
      setStatus("fail");
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function setVolState(kind: Kind, next: VolumeInfo) {
    if (kind === "output") setOutputVol(next);
    else setInputVol(next);
  }

  function onVolume(kind: Kind, percent: number) {
    const cur = kind === "output" ? outputVol : inputVol;
    setVolState(kind, { volume: percent / 100, muted: cur?.muted ?? false });
    if (timers.current[kind]) clearTimeout(timers.current[kind]);
    timers.current[kind] = setTimeout(() => {
      void setVolumeFor[kind](percent / 100).catch((e) => {
        setStatus("fail");
        setMessage(String(e));
      });
    }, WRITE_DEBOUNCE_MS);
  }

  async function onToggleMute(kind: Kind) {
    const cur = kind === "output" ? outputVol : inputVol;
    if (!cur) return;
    const muted = !cur.muted;
    setVolState(kind, { ...cur, muted });
    try {
      await setMuteFor[kind](muted);
    } catch (e) {
      setStatus("fail");
      setMessage(String(e));
    }
  }

  async function onSelectDevice(kind: Kind, id: string) {
    if (!id) return;
    setBusy(true);
    try {
      await setDefaultFor[kind](id);
      // Re-read so the slider reflects the newly-default device's own volume.
      await load();
    } catch (e) {
      setStatus("fail");
      setMessage(String(e));
      setBusy(false);
    }
  }

  function renderSection(
    kind: Kind,
    label: string,
    devices: AudioDevice[],
    vol: VolumeInfo | null,
  ) {
    const muted = vol?.muted ?? false;
    const MuteIcon = kind === "output" ? (muted ? VolumeX : Volume2) : muted ? MicOff : Mic;
    return (
      <div className="rounded-md border border-line p-3">
        <p className="text-sm font-medium text-ink">{label}</p>

        <select
          value={defaultId(devices)}
          disabled={busy || devices.length === 0}
          onChange={(e) => void onSelectDevice(kind, e.target.value)}
          aria-label={`${label} device`}
          className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink disabled:opacity-50"
        >
          {devices.length === 0 && <option value="">No devices</option>}
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        {vol ? (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void onToggleMute(kind)}
              aria-label={muted ? `Unmute ${label.toLowerCase()}` : `Mute ${label.toLowerCase()}`}
              title={muted ? "Unmute" : "Mute"}
              className={`shrink-0 rounded-md border border-line p-1.5 hover:bg-neutral-50 ${
                muted ? "text-rose-600" : "text-neutral-500"
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
              {muted ? "Muted" : `${vpct(vol.volume)}%`}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-xs italic text-neutral-400">No volume control available.</p>
        )}
      </div>
    );
  }

  return (
    <div className="col-span-2 rounded-lg border border-line bg-white/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink flex items-center gap-2">
            <Volume2 size={16} className="text-accent" aria-hidden />
            Sound
          </h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            System volume, mute, and default output/input device for the speakers and microphone.
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
          className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          onClick={() => void load()}
          title="Re-enumerate audio devices"
        >
          Refresh
        </button>
      </div>

      {message && (
        <p className={`mt-2 text-xs ${status === "fail" ? "text-rose-600" : "text-neutral-500"}`}>
          {message}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {renderSection("output", "Output", outputDevices, outputVol)}
        {renderSection("input", "Input", inputDevices, inputVol)}
      </div>
    </div>
  );
}
