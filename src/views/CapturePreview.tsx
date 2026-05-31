import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Check, Clipboard, Save, X } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import {
  copyLatestCaptureToClipboard,
  hideCapturePreview,
  previewReady,
  saveLatestCaptureToDesktop,
  takeLatestCapture,
  type CaptureResult,
} from '../lib/commands';

type Phase =
  | 'hidden'
  | 'slide-in'
  | 'idle'
  | 'scale-out'
  | 'scale-in'
  | 'closing';

type ActState = 'idle' | 'busy' | 'success';

const PHASE_ANIMATION: Record<Phase, string | undefined> = {
  hidden: undefined,
  idle: undefined,
  'slide-in': 'cap-slide-in 240ms cubic-bezier(0.16, 1, 0.3, 1) both',
  'scale-out': 'cap-scale-out 130ms ease-in both',
  'scale-in': 'cap-scale-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
  closing: 'cap-close-out 200ms ease-in both',
};

// Runs `callback` after the next paint (or a 300ms fallback). Pure utility, so
// it lives at module scope. Returns a cleanup that cancels the pending run.
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

interface View {
  capture: CaptureResult | null;
  phase: Phase;
  revision: number;
}

export function CapturePreview() {
  const [view, setView] = useState<View>({
    capture: null,
    phase: 'hidden',
    revision: 0,
  });
  const [error, setError] = useState<string>();
  const [actions, setActions] = useState<{ copy: ActState; save: ActState }>({
    copy: 'idle',
    save: 'idle',
  });
  const { capture, phase, revision } = view;

  const closeTimer = useRef<number | undefined>(undefined);
  const lastFetchAt = useRef(0);
  const phaseRef = useRef<Phase>('hidden');
  const captureRef = useRef<CaptureResult | null>(null);
  const pending = useRef<CaptureResult | null>(null);

  function setPhase(next: Phase) {
    setView((v) => ({ ...v, phase: next }));
  }

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    const timer = closeTimer;
    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
    };
  }, []);

  // State updates live in the deferred `.then`/`.catch` callbacks, so this is
  // safe to call from an effect.
  function fetchLatest(isRefresh = false) {
    const started = performance.now();
    lastFetchAt.current = started;
    return takeLatestCapture()
      .then((c) => {
        if (!c) {
          setError('No capture available.');
          return;
        }

        // Re-displaying the identical capture (e.g. on window focus) shouldn't
        // replay the swap animation.
        if (
          isRefresh &&
          captureRef.current &&
          c.dataUrl === captureRef.current.dataUrl
        ) {
          return;
        }

        setError(undefined);
        setActions({ copy: 'idle', save: 'idle' });

        const visible =
          phaseRef.current !== 'hidden' && phaseRef.current !== 'closing';
        if (isRefresh && visible && captureRef.current) {
          // A preview is already on screen: scale the old one out, then the new in.
          pending.current = c;
          setPhase('scale-out');
        } else {
          // First display: slide it in once the window is shown.
          setView((v) => ({ ...v, capture: c, revision: v.revision + 1 }));
        }
      })
      .catch((e: unknown) => setError(String(e)));
  }

  // Effect Events so the mount-only effect below doesn't depend on fetchLatest.
  const onFirstFetch = useEffectEvent(() => void fetchLatest());
  const onRefetch = useEffectEvent(() => void fetchLatest(true));

  useEffect(() => {
    // Not state initialization: this pulls the latest capture from the Rust
    // backend on mount (the backend also pushes later updates via events).
    // eslint-disable-next-line react-doctor/no-initialize-state
    onFirstFetch();

    const unlisten = listen('refresh-capture', () => {
      onRefetch();
    });

    function fetchWhenWoken() {
      if (document.visibilityState === 'hidden') return;
      if (performance.now() - lastFetchAt.current < 500) return;
      onRefetch();
    }

    window.addEventListener('focus', fetchWhenWoken);
    document.addEventListener('visibilitychange', fetchWhenWoken);

    return () => {
      void unlisten.then((u) => u());
      window.removeEventListener('focus', fetchWhenWoken);
      document.removeEventListener('visibilitychange', fetchWhenWoken);
    };
  }, []);

  useEffect(() => {
    if (revision === 0) return;

    return afterPaint(() => {
      void previewReady()
        .then(() => setView((v) => ({ ...v, phase: 'slide-in' })))
        .catch((e: unknown) => setError(String(e)));
    });
  }, [revision]);

  function onCardAnimationEnd(e: React.AnimationEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const current = phaseRef.current;
    if (current === 'scale-out') {
      if (pending.current) {
        const next = pending.current;
        pending.current = null;
        setView((v) => ({ ...v, capture: next, phase: 'scale-in' }));
      } else {
        setPhase('scale-in');
      }
    } else if (current === 'slide-in' || current === 'scale-in') {
      setPhase('idle');
    }
  }

  async function close() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
    }
    setPhase('closing');
    window.setTimeout(() => {
      void hideCapturePreview()
        .then(() => setPhase('hidden'))
        .catch((e: unknown) => setError(String(e)));
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
    if (!capture || actions.copy === 'busy') return;
    setActions((a) => ({ ...a, copy: 'busy' }));
    try {
      await copyLatestCaptureToClipboard();
      setActions((a) => ({ ...a, copy: 'success' }));
      closeSoon();
    } catch (e) {
      setActions((a) => ({ ...a, copy: 'idle' }));
      setError(String(e));
    }
  }

  async function saveCapture() {
    if (!capture || actions.save === 'busy') return;
    setActions((a) => ({ ...a, save: 'busy' }));
    try {
      await saveLatestCaptureToDesktop();
      setActions((a) => ({ ...a, save: 'success' }));
      closeSoon();
    } catch (e) {
      setActions((a) => ({ ...a, save: 'idle' }));
      setError(String(e));
    }
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-transparent"
      data-tauri-drag-region
    >
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
        className="group bg-foreground absolute bottom-0 left-0 h-[200px] w-[250px] overflow-hidden rounded-lg border border-white/10 shadow-lg"
        data-tauri-drag-region
        onAnimationEnd={onCardAnimationEnd}
        style={{
          opacity: phase === 'hidden' ? 0 : 1,
          transformOrigin: '50% 50%',
          animation: PHASE_ANIMATION[phase],
        }}
      >
        {error && (
          <p className="text-destructive absolute inset-0 flex items-center justify-center px-3 text-center text-xs">
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
          <div className="bg-foreground/55 absolute inset-0 flex items-center justify-center gap-2 opacity-0 backdrop-blur-[1px] transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
            <ActionButton
              icon={actions.copy === 'success' ? Check : Clipboard}
              label={actions.copy === 'success' ? 'Copied' : 'Copy'}
              busy={actions.copy === 'busy'}
              onClick={() => void copyCapture()}
            />
            <ActionButton
              icon={actions.save === 'success' ? Check : Save}
              label={actions.save === 'success' ? 'Saved' : 'Save'}
              busy={actions.save === 'busy'}
              onClick={() => void saveCapture()}
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => void close()}
          className="bg-foreground/70 text-background hover:bg-foreground absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
          aria-label="Close preview"
        >
          <X aria-hidden="true" size={14} strokeWidth={2.25} />
        </button>

        {capture && (
          <span className="bg-foreground/70 text-background/80 pointer-events-none absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 font-mono text-[10px] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
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
      className="bg-foreground/75 text-background hover:bg-foreground flex h-8 min-w-[76px] items-center justify-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs font-semibold shadow-lg transition active:translate-y-px disabled:cursor-wait"
    >
      <Icon aria-hidden="true" size={14} strokeWidth={2.35} />
      {label}
    </button>
  );
}
