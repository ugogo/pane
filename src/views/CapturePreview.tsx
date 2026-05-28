import { useEffect, useRef, useState } from "react";
import { Check, Clipboard, Save, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import {
  copyLatestCaptureToClipboard,
  hideCapturePreview,
  previewReady,
  saveLatestCaptureToDesktop,
  takeLatestCapture,
  type CaptureResult,
} from "../lib/commands";

type Phase = "hidden" | "slide-in" | "idle" | "scale-out" | "scale-in" | "closing";

const PHASE_ANIMATION: Record<Phase, string | undefined> = {
  hidden: undefined,
  idle: undefined,
  "slide-in": "cap-slide-in 240ms cubic-bezier(0.16, 1, 0.3, 1) both",
  "scale-out": "cap-scale-out 130ms ease-in both",
  "scale-in": "cap-scale-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
  closing: "cap-close-out 200ms ease-in both",
};

export function CapturePreview() {
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [phase, setPhase] = useState<Phase>("hidden");
  const [copyState, setCopyState] = useState<"idle" | "busy" | "success">("idle");
  const [saveState, setSaveState] = useState<"idle" | "busy" | "success">("idle");
  const closeTimer = useRef<number>();
  const lastFetchAt = useRef(0);
  const phaseRef = useRef<Phase>("hidden");
  const captureRef = useRef<CaptureResult | null>(null);
  const pending = useRef<CaptureResult | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      if (closeTimer.current) {
        window.clearTimeout(closeTimer.current);
      }
    };
  }, []);

  async function fetchLatest(isRefresh = false) {
    const started = performance.now();
    lastFetchAt.current = started;
    try {
      const c = await takeLatestCapture();
      if (!c) {
        setError("No capture available.");
        return;
      }

      // Re-displaying the identical capture (e.g. on window focus) shouldn't
      // replay the swap animation.
      if (isRefresh && captureRef.current && c.dataUrl === captureRef.current.dataUrl) {
        return;
      }

      setError(undefined);
      setCopyState("idle");
      setSaveState("idle");

      const visible = phaseRef.current !== "hidden" && phaseRef.current !== "closing";
      if (isRefresh && visible && captureRef.current) {
        // A preview is already on screen: scale the old one out, then the new in.
        pending.current = c;
        setPhase("scale-out");
      } else {
        // First display: slide it in once the window is shown.
        setCapture(c);
        setRevision((r) => r + 1);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void fetchLatest();

    const unlisten = listen("refresh-capture", () => {
      void fetchLatest(true);
    });

    function fetchWhenWoken() {
      if (document.visibilityState === "hidden") return;
      if (performance.now() - lastFetchAt.current < 500) return;
      void fetchLatest(true);
    }

    window.addEventListener("focus", fetchWhenWoken);
    document.addEventListener("visibilitychange", fetchWhenWoken);

    return () => {
      void unlisten.then((u) => u());
      window.removeEventListener("focus", fetchWhenWoken);
      document.removeEventListener("visibilitychange", fetchWhenWoken);
    };
  }, []);

  function afterPaint(callback: () => void) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      callback();
    };

    const timeout = window.setTimeout(finish, 300);
    const firstFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.clearTimeout(timeout);
        finish();
      });
    });

    return () => {
      done = true;
      window.clearTimeout(timeout);
      cancelAnimationFrame(firstFrame);
    };
  }

  useEffect(() => {
    if (revision === 0) return;

    return afterPaint(() => {
      void previewReady()
        .then(() => setPhase("slide-in"))
        .catch((e) => setError(String(e)));
    });
  }, [revision]);

  function onCardAnimationEnd(e: React.AnimationEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const current = phaseRef.current;
    if (current === "scale-out") {
      if (pending.current) {
        setCapture(pending.current);
        pending.current = null;
      }
      setPhase("scale-in");
    } else if (current === "slide-in" || current === "scale-in") {
      setPhase("idle");
    }
  }

  async function close() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
    }
    setPhase("closing");
    window.setTimeout(() => {
      void hideCapturePreview()
        .then(() => setPhase("hidden"))
        .catch((e) => setError(String(e)));
    }, 200);
  }

  function closeSoon() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
    }
    closeTimer.current = window.setTimeout(() => {
      void close();
    }, 2200);
  }

  async function copyCapture() {
    if (!capture || copyState === "busy") return;
    setCopyState("busy");
    try {
      await copyLatestCaptureToClipboard();
      setCopyState("success");
      closeSoon();
    } catch (e) {
      setCopyState("idle");
      setError(String(e));
    }
  }

  async function saveCapture() {
    if (!capture || saveState === "busy") return;
    setSaveState("busy");
    try {
      await saveLatestCaptureToDesktop();
      setSaveState("success");
      closeSoon();
    } catch (e) {
      setSaveState("idle");
      setError(String(e));
    }
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-transparent" data-tauri-drag-region>
      <style>
        {`
          @keyframes cap-slide-in {
            from { opacity: 0; transform: translateY(14px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes cap-scale-in {
            from { opacity: 0; transform: scale(0.92); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes cap-scale-out {
            from { opacity: 1; transform: scale(1); }
            to   { opacity: 0; transform: scale(0.92); }
          }
          @keyframes cap-close-out {
            from { opacity: 1; transform: translateY(0); }
            to   { opacity: 0; transform: translateY(14px); }
          }
        `}
      </style>
      <div
        className="group absolute bottom-0 left-0 h-[200px] w-[250px] overflow-hidden rounded-lg bg-slate-900 shadow-2xl"
        data-tauri-drag-region
        onAnimationEnd={onCardAnimationEnd}
        style={{
          opacity: phase === "hidden" ? 0 : 1,
          transformOrigin: "50% 50%",
          animation: PHASE_ANIMATION[phase],
        }}
      >
        {error && (
          <p className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-rose-400">
            {error}
          </p>
        )}
        {capture && (
          <img
            key={revision}
            src={capture.dataUrl}
            alt="Capture preview"
            className="pointer-events-none h-full w-full object-contain"
            draggable={false}
            data-tauri-drag-region
          />
        )}

        {capture && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/55 opacity-0 backdrop-blur-[1px] transition-opacity duration-150 group-hover:opacity-100">
            <ActionButton
              icon={copyState === "success" ? Check : Clipboard}
              label={copyState === "success" ? "Copied" : "Copy"}
              busy={copyState === "busy"}
              onClick={() => void copyCapture()}
            />
            <ActionButton
              icon={saveState === "success" ? Check : Save}
              label={saveState === "success" ? "Saved" : "Save"}
              busy={saveState === "busy"}
              onClick={() => void saveCapture()}
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => void close()}
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-[11px] text-slate-200 opacity-0 transition-opacity duration-150 hover:bg-slate-900/90 group-hover:opacity-100"
          aria-label="Close preview"
        >
          <X aria-hidden="true" size={14} strokeWidth={2.25} />
        </button>

        {capture && (
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-slate-900/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {capture.width} x {capture.height}
          </span>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  busy,
  onClick,
}: {
  icon: typeof Clipboard;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className="flex h-8 min-w-[76px] items-center justify-center gap-1.5 rounded-md bg-slate-900/70 px-2.5 text-xs font-semibold text-slate-200 shadow-lg transition hover:bg-slate-900/90 active:bg-slate-950 disabled:cursor-wait"
    >
      <Icon aria-hidden="true" size={14} strokeWidth={2.35} />
      {label}
    </button>
  );
}
