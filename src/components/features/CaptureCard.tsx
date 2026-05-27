import { useEffect, useState } from "react";
import {
  captureFullscreen,
  clearCaptureHotkey,
  getCaptureHotkeys,
  setCaptureHotkey,
  showAreaSelector,
  showCapturePreview,
  toggleCapturePreview,
  type CaptureAction,
} from "../../lib/commands";
import { ShortcutInput } from "../ShortcutInput";

type ProbeStatus = "idle" | "pass" | "warn" | "fail";

const statusStyles: Record<ProbeStatus, string> = {
  idle: "bg-neutral-100 text-neutral-600",
  pass: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  fail: "bg-rose-100 text-rose-800",
};

async function runFullscreen(): Promise<string | null> {
  try {
    const result = await captureFullscreen();
    await showCapturePreview();
    return null;
  } catch (err) {
    return String(err);
  }
}

async function runArea(): Promise<string | null> {
  try {
    await showAreaSelector();
    return null;
  } catch (err) {
    return String(err);
  }
}

export function CaptureCard() {
  const [fullscreenAccel, setFullscreenAccel] = useState("");
  const [areaAccel, setAreaAccel] = useState("");
  const [status, setStatus] = useState<ProbeStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getCaptureHotkeys()
      .then((hotkeys) => {
        setFullscreenAccel(hotkeys.fullscreen);
        setAreaAccel(hotkeys.area);
      })
      .catch((err) => {
        setStatus("warn");
        setMessage(`Could not load saved hotkeys: ${String(err)}`);
      });
  }, []);

  async function bind(action: CaptureAction, accel: string) {
    try {
      await setCaptureHotkey(action, accel);
      if (action === "fullscreen") setFullscreenAccel(accel);
      else setAreaAccel(accel);
      setStatus("pass");
      setMessage(`Bound ${action} → ${accel}`);
    } catch (err) {
      setStatus("fail");
      setMessage(String(err));
    }
  }

  async function clear(action: CaptureAction) {
    try {
      await clearCaptureHotkey(action);
      if (action === "fullscreen") setFullscreenAccel("");
      else setAreaAccel("");
      setStatus("idle");
      setMessage(`Cleared ${action} hotkey.`);
    } catch (err) {
      setStatus("fail");
      setMessage(String(err));
    }
  }

  async function trigger(action: CaptureAction) {
    setBusy(true);
    const err = action === "fullscreen" ? await runFullscreen() : await runArea();
    setBusy(false);
    if (err) {
      setStatus("fail");
      setMessage(err);
    } else {
      setStatus("pass");
      setMessage(`Triggered ${action}.`);
    }
  }

  return (
    <div className="col-span-2 rounded-lg border border-line bg-white/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Screen capture</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            Fullscreen and area capture, triggerable via global hotkeys. The area
            selector overlay is centred at half monitor width and half height minus 50px.
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[status]}`}>
          {status}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Row
          label="Fullscreen capture"
          hotkey={fullscreenAccel}
          onCommit={(a) => void bind("fullscreen", a)}
          onClear={() => void clear("fullscreen")}
          onTrigger={() => void trigger("fullscreen")}
          busy={busy}
        />
        <Row
          label="Area capture"
          hotkey={areaAccel}
          onCommit={(a) => void bind("area", a)}
          onClear={() => void clear("area")}
          onTrigger={() => void trigger("area")}
          busy={busy}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50"
          onClick={() => {
            void toggleCapturePreview().then((visible) => {
              setStatus("idle");
              setMessage(visible ? "Preview shown." : "Preview hidden.");
            });
          }}
        >
          Toggle preview
        </button>
        {message && (
          <p className={`text-xs ${status === "fail" ? "text-rose-600" : "text-neutral-500"}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  hotkey,
  onCommit,
  onClear,
  onTrigger,
  busy,
}: {
  label: string;
  hotkey: string;
  onCommit: (a: string) => void;
  onClear: () => void;
  onTrigger: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-md border border-line p-3">
      <p className="text-sm font-medium text-ink">{label}</p>
      <div className="mt-2">
        <ShortcutInput
          value={hotkey}
          onCommit={onCommit}
          onClear={onClear}
          placeholder="Click and press a chord"
        />
      </div>
      <button
        type="button"
        disabled={busy}
        className="mt-2 rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-neutral-50 disabled:opacity-50"
        onClick={onTrigger}
      >
        Trigger now
      </button>
    </div>
  );
}
