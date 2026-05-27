import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { previewReady, takeLatestCapture, type CaptureResult } from "../lib/commands";

/**
 * Floating, always-on-top preview. The native window is a taller transparent
 * strip, and this component slides the visible 200x200 card inside it so the
 * first-create animation is not dependent on OS-level window movement.
 */
export function CapturePreview() {
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  const reportedReady = useRef(false);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  async function fetchLatest(isRefresh = false) {
    try {
      const c = await takeLatestCapture();
      if (!c) {
        setError("No capture available.");
        return;
      }
      setError(undefined);
      setCapture(c);
      setRevision((r) => r + 1);
      if (isRefresh && reportedReady.current) {
        setClosing(false);
        setShown(true);
        setRefreshKey((key) => key + 1);
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
    return () => {
      void unlisten.then((u) => u());
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

  // First open slides in. Refreshes while open are handled by a keyframed pulse.
  useEffect(() => {
    if (revision === 0) return;
    if (reportedReady.current) return;

    setClosing(false);
    setShown(false);

    return afterPaint(() => {
      reportedReady.current = true;
      void previewReady()
        .then(() => setShown(true))
        .catch((e) => setError(String(e)));
    });
  }, [revision]);

  async function close() {
    setClosing(true);
    setShown(false);
    window.setTimeout(() => {
      void getCurrentWindow().close().catch((e) => setError(String(e)));
    }, 340);
  }

  const cardTransform = closing
    ? "translateY(48px) scale(0.98)"
    : shown
      ? "translateY(0) scale(1)"
      : "translateY(48px) scale(1)";

  return (
    <div className="fixed inset-0 overflow-hidden bg-transparent" data-tauri-drag-region>
      <style>
        {`
          @keyframes capture-preview-refresh {
            0% { opacity: 0.45; transform: translateY(0) scale(0.94); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}
      </style>
      <div
        key={refreshKey}
        className="group absolute bottom-0 left-0 h-[200px] w-[200px] overflow-hidden rounded-lg bg-slate-900 shadow-2xl"
        data-tauri-drag-region
        style={{
          opacity: shown && !closing ? 1 : 0,
          transform: cardTransform,
          transformOrigin: "50% 50%",
          transition: "opacity 240ms ease-out, transform 320ms cubic-bezier(0.16, 1, 0.3, 1)",
          animation:
            refreshKey > 0 && !closing
              ? "capture-preview-refresh 240ms cubic-bezier(0.2, 0, 0, 1)"
              : undefined,
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
