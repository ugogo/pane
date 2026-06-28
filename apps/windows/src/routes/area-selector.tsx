import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { createFileRoute } from '@tanstack/react-router';
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

export const Route = createFileRoute('/area-selector')({
  component: AreaSelectorPage,
});

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

function AreaSelectorPage() {
  const [drag, setDrag] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);
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
      className="area-selector-root"
      role="application"
      aria-label="Drag to select a capture region"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'transparent',
        cursor: 'crosshair',
        userSelect: 'none',
      }}
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
      {!rect ? <div className="area-selector-dim" /> : null}

      {rect ? (
        <div
          className="area-selector-rect"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
          }}
        >
          <span
            className="area-selector-pill area-selector-size-label"
            style={{
              top: sizeLabelInside ? 6 : -24,
            }}
          >
            {Math.round(rect.w)} x {Math.round(rect.h)}
          </span>
        </div>
      ) : null}

      <div
        className="area-selector-pill"
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          top: helperAtBottom ? undefined : 12,
          bottom: helperAtBottom ? 12 : undefined,
        }}
      >
        Drag to select - Esc to cancel
      </div>

      {error ? (
        <div
          className="area-selector-pill area-selector-error"
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
