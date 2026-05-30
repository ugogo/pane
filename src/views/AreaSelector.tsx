import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  areaSelectorOrigin,
  commitRegionCapture,
  hideAreaSelector,
} from '../lib/commands';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectFrom(
  a: { x: number; y: number },
  b: { x: number; y: number },
): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}

export function AreaSelector() {
  const [drag, setDrag] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    function reset() {
      setDrag(null);
      setSubmitting(false);
      setError(undefined);
    }

    reset();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        void hideAreaSelector();
      }
    }

    const unlisten = listen('reset-area-selector', reset);
    window.addEventListener('keydown', onKey);
    return () => {
      void unlisten.then((u) => u());
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  function pt(e: React.MouseEvent) {
    return { x: e.clientX, y: e.clientY };
  }

  async function finish(rect: Rect) {
    if (rect.w < 4 || rect.h < 4) {
      await hideAreaSelector();
      return;
    }
    setSubmitting(true);
    try {
      const [originX, originY] = await areaSelectorOrigin();
      const dpr = window.devicePixelRatio || 1;
      const sx = Math.round(originX + rect.x * dpr);
      const sy = Math.round(originY + rect.y * dpr);
      const sw = Math.max(1, Math.round(rect.w * dpr));
      const sh = Math.max(1, Math.round(rect.h * dpr));

      await commitRegionCapture(sx, sy, sw, sh);
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  }

  const rect = drag ? rectFrom(drag.start, drag.end) : null;

  return (
    <div
      className="fixed inset-0 select-none"
      style={{
        background: 'transparent',
        cursor: 'crosshair',
      }}
      onMouseDown={(e) => {
        if (submitting) return;
        const p = pt(e);
        setDrag({ start: p, end: p });
      }}
      onMouseMove={(e) => {
        if (!drag) return;
        setDrag({ start: drag.start, end: pt(e) });
      }}
      onMouseUp={(e) => {
        if (!drag) return;
        const finalRect = rectFrom(drag.start, pt(e));
        setDrag(null);
        void finish(finalRect);
      }}
    >
      {!rect && (
        <div
          className="pointer-events-none fixed inset-0"
          style={{ background: 'rgba(2, 6, 23, 0.65)' }}
        />
      )}

      {rect && (
        <div
          className="pointer-events-none absolute border-2 border-sky-300"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            boxShadow: '0 0 0 100vmax rgba(2, 6, 23, 0.65)',
          }}
        >
          <span className="absolute -top-5 left-0 rounded bg-sky-500 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {Math.round(rect.w)} x {Math.round(rect.h)}
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-black/60 px-3 py-1 text-xs font-medium text-white">
        Drag to select - Esc to cancel
      </div>

      {error && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-rose-600 px-3 py-1 text-xs text-white">
          {error}
        </div>
      )}
    </div>
  );
}
