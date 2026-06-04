import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  areaSelectorOrigin,
  commitRegionCapture,
  hideAreaSelector,
} from '@/lib/commands';

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

function pt(e: React.MouseEvent) {
  return { x: e.clientX, y: e.clientY };
}

export default function AreaSelectorPage() {
  const [drag, setDrag] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);
  // Read only in handlers (never in render), so a ref avoids re-renders.
  const submitting = useRef(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    function reset() {
      setDrag(null);
      submitting.current = false;
      setError(undefined);
    }

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

  async function finish(rect: Rect) {
    if (rect.w < 4 || rect.h < 4) {
      await hideAreaSelector();
      return;
    }
    submitting.current = true;
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
      submitting.current = false;
    }
  }

  const rect = drag ? rectFrom(drag.start, drag.end) : null;
  const sizeLabelInside = rect ? rect.y < 28 : false;
  const helperAtBottom = rect ? rect.y < 52 : false;

  return (
    <div
      role="application"
      aria-label="Drag to select a capture region"
      className="fixed inset-0 select-none"
      style={{ background: 'transparent', cursor: 'crosshair' }}
      onMouseDown={(e) => {
        if (submitting.current) return;
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
          style={{ background: 'rgba(24, 23, 19, 0.58)' }}
        />
      )}

      {rect && (
        <div
          className="border-primary pointer-events-none absolute border"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            boxShadow:
              '0 0 0 100vmax rgba(24, 23, 19, 0.58), 0 0 0 1px rgba(255, 254, 250, 0.55)',
          }}
        >
          <span
            className={`border-border bg-card/90 text-card-foreground absolute left-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] shadow-lg ${
              sizeLabelInside ? 'top-1.5' : '-top-6'
            }`}
          >
            {Math.round(rect.w)} x {Math.round(rect.h)}
          </span>
        </div>
      )}

      <div
        className={`border-border bg-card/90 text-card-foreground pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-md border px-3 py-1.5 text-xs font-medium shadow-lg ${
          helperAtBottom ? 'bottom-3' : 'top-3'
        }`}
      >
        Drag to select - Esc to cancel
      </div>

      {error && (
        <div className="bg-destructive absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
