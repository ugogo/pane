import { useEffect, useRef, useState } from 'react';
import { Check, Clipboard, Save, X } from '@pane/ui';
import { useEffectEvent } from '@/lib/use-effect-event';
import { listen } from '@tauri-apps/api/event';
import {
  copyLatestCaptureToClipboard,
  hideCapturePreview,
  previewReady,
  saveLatestCaptureToDesktop,
  takeLatestCapture,
  type CaptureResult,
} from '@/lib/commands';

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

export default function PreviewPage() {
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
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function fetchLatest(isRefresh = false) {
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
      .catch((e: unknown) => setError(String(e)));
  }

  const onFirstFetch = useEffectEvent(() => void fetchLatest());
  const onRefetch = useEffectEvent(() => void fetchLatest(true));

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
      <style>{`
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
      `}</style>
      <div
        className="preview-card preview-card-animated"
        data-tauri-drag-region
        onAnimationEnd={onCardAnimationEnd}
        style={{
          opacity: phase === 'hidden' ? 0 : 1,
          animation: PHASE_ANIMATION[phase],
        }}
      >
        {error ? <p className="preview-error">{error}</p> : null}
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
          <div className="preview-overlay">
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
          className="preview-close"
          aria-label="Close preview"
        >
          <X aria-hidden size={14} />
        </button>

        {capture && (
          <span className="preview-size">
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
      className="preview-action-btn"
    >
      <Icon aria-hidden size={14} />
      {label}
    </button>
  );
}
