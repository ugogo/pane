import { useEffect, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  CheckIcon,
  ClipboardIcon,
  DownloadIcon,
  PenIcon,
  XIcon,
} from 'lucide-react';
import { useEffectEvent } from '@/lib/use-effect-event';
import { listen } from '@tauri-apps/api/event';
import {
  copyLatestCaptureToClipboard,
  hideCapturePreview,
  previewReady,
  saveLatestCaptureToDesktop,
  showImageEditor,
  takeLatestCapture,
  toggleCaptureZoom,
  type CaptureResult,
} from '@/lib/commands';

export const Route = createFileRoute('/preview')({
  component: PreviewPage,
});

type Phase =
  | 'hidden'
  | 'slide-in'
  | 'idle'
  | 'scale-out'
  | 'scale-in'
  | 'closing';
type ActState = 'idle' | 'busy' | 'success';

const CAPTURE_KEYFRAMES = `
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
`;

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

function PreviewPage() {
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
  const fetchInFlight = useRef(false);
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
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function fetchLatest(isRefresh = false) {
    // One fetch at a time. The refresh-capture event and the focus/visibility
    // wake-ups all fire together when a capture is shown, but take_latest_capture
    // always returns the newest capture, so a single in-flight fetch covers the
    // whole burst — the others would just re-fetch identical bytes.
    if (fetchInFlight.current) return Promise.resolve();
    fetchInFlight.current = true;
    const started = performance.now();
    lastFetchAt.current = started;
    return takeLatestCapture()
      .then((c) => {
        if (!c) {
          setError('No capture available.');
          return;
        }

        if (
          isRefresh &&
          captureRef.current &&
          c.dataUrl === captureRef.current.dataUrl
        )
          return;

        setError(undefined);
        setActions({ copy: 'idle', save: 'idle' });

        const visible =
          phaseRef.current !== 'hidden' && phaseRef.current !== 'closing';
        if (isRefresh && visible && captureRef.current) {
          pending.current = c;
          setPhase('scale-out');
        } else {
          setView((v) => ({ ...v, capture: c, revision: v.revision + 1 }));
        }
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => {
        fetchInFlight.current = false;
      });
  }

  const onFirstFetch = useEffectEvent(() => void fetchLatest());
  const onRefetch = useEffectEvent(() => void fetchLatest(true));

  // Space opens (or closes) the separate enlarged-preview window. The small card
  // stays put; the zoom window layers a larger, controls-free copy on top.
  const onToggleZoom = useEffectEvent(() => {
    if (!captureRef.current) return;
    void toggleCaptureZoom().catch((e: unknown) => setError(String(e)));
  });

  useEffect(() => {
    // eslint-disable-next-line react-doctor/no-initialize-state -- capture preview fetches on window open
    onFirstFetch();

    const unlisten = listen('refresh-capture', () => {
      onRefetch();
    });

    function fetchWhenWoken() {
      if (document.visibilityState === 'hidden') return;
      if (performance.now() - lastFetchAt.current < 500) return;
      onRefetch();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault();
        onToggleZoom();
      }
    }

    window.addEventListener('focus', fetchWhenWoken);
    document.addEventListener('visibilitychange', fetchWhenWoken);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      void unlisten.then((u) => u());
      window.removeEventListener('focus', fetchWhenWoken);
      document.removeEventListener('visibilitychange', fetchWhenWoken);
      window.removeEventListener('keydown', onKeyDown);
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

  function editCapture() {
    if (!captureRef.current) return;
    void showImageEditor().catch((e: unknown) => setError(String(e)));
  }

  async function close() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setPhase('closing');
    window.setTimeout(() => {
      void hideCapturePreview()
        .then(() => setPhase('hidden'))
        .catch((e: unknown) => setError(String(e)));
    }, 200);
  }

  function closeSoon() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
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
      <style>{CAPTURE_KEYFRAMES}</style>
      <div
        className="group absolute bottom-0 left-0 h-[200px] w-[250px] overflow-hidden rounded-lg border border-border bg-muted text-foreground shadow-[0_8px_24px_var(--app-shadow-strong)] [&_img]:-outline-offset-1 [&_img]:outline [&_img]:outline-white/10"
        data-tauri-drag-region
        onAnimationEnd={onCardAnimationEnd}
        style={{
          opacity: phase === 'hidden' ? 0 : 1,
          animation: PHASE_ANIMATION[phase],
          transformOrigin: '50% 50%',
        }}
      >
        {error ? (
          <p className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {capture && (
          <img
            key={revision}
            src={capture.dataUrl}
            alt="Capture preview"
            draggable={false}
            data-tauri-drag-region
            style={{
              pointerEvents: 'none',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        )}

        {capture && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[var(--app-preview-overlay)] opacity-0 backdrop-blur-[1px] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            <ActionButton
              icon={actions.copy === 'success' ? CheckIcon : ClipboardIcon}
              label={actions.copy === 'success' ? 'Copied' : 'Copy'}
              busy={actions.copy === 'busy'}
              onClick={() => void copyCapture()}
            />
            <ActionButton
              icon={actions.save === 'success' ? CheckIcon : DownloadIcon}
              label={actions.save === 'success' ? 'Saved' : 'Save'}
              busy={actions.save === 'busy'}
              onClick={() => void saveCapture()}
            />
          </div>
        )}

        {capture && (
          <PreviewChromeButton
            icon={PenIcon}
            label="Edit capture"
            side="left"
            onClick={editCapture}
          />
        )}

        <PreviewChromeButton
          icon={XIcon}
          label="Close preview"
          side="right"
          onClick={() => void close()}
        />

        {capture && (
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 bg-[var(--app-preview-control)]">
            {capture.width} x {capture.height}
          </span>
        )}
      </div>
    </div>
  );
}

function PreviewChromeButton({
  icon: Icon,
  label,
  side,
  onClick,
}: {
  icon: typeof PenIcon;
  label: string;
  side: 'left' | 'right';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={`absolute top-1.5 z-[2] flex size-[30px] cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--app-preview-control)] text-foreground opacity-0 transition-[background-color,opacity] duration-150 hover:bg-muted group-hover:opacity-100 group-focus-within:opacity-100 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:text-current ${side === 'left' ? 'left-1.5' : 'right-1.5'}`}
      aria-label={label}
    >
      <Icon aria-hidden size={14} />
    </button>
  );
}

function ActionButton({
  icon: Icon,
  label,
  busy,
  onClick,
}: {
  icon: typeof ClipboardIcon;
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
      className="flex h-8 min-w-[76px] cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-[var(--app-preview-control)] text-xs font-semibold text-foreground shadow-[0_4px_12px_var(--app-shadow)] disabled:cursor-wait [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:text-muted-foreground"
    >
      <Icon aria-hidden size={14} />
      {label}
    </button>
  );
}
