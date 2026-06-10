import { useCallback, useRef, useState } from 'react';
import type { CaptureShot } from '../mock/types';
import { useActions } from '../mock/store';

// Reusable capture state-machine. Prototypes render their own overlay chrome
// but share the drag-selection math and phase transitions.

export type CapturePhase = 'idle' | 'choose' | 'select' | 'preview';
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CaptureFlow {
  phase: CapturePhase;
  mode: 'fullscreen' | 'area' | null;
  region: Region | null; // fractional 0..1 during selection
  shot: CaptureShot | null;
  start: () => void;
  choose: (mode: 'fullscreen' | 'area') => void;
  reset: () => void;
  /** spread onto the full-bleed selection layer */
  selectionProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
  };
}

export function useCaptureFlow(): CaptureFlow {
  const actions = useActions();
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [mode, setMode] = useState<CaptureFlow['mode']>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [shot, setShot] = useState<CaptureShot | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const start = useCallback(() => {
    setPhase('choose');
    setMode(null);
    setRegion(null);
    setShot(null);
  }, []);

  const choose = useCallback(
    (m: 'fullscreen' | 'area') => {
      setMode(m);
      if (m === 'fullscreen') {
        const s = actions.addCapture('fullscreen');
        setShot(s);
        setPhase('preview');
      } else {
        setPhase('select');
      }
    },
    [actions],
  );

  const reset = useCallback(() => {
    setPhase('idle');
    setMode(null);
    setRegion(null);
    setShot(null);
    dragStart.current = null;
  }, []);

  const frac = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = frac(e);
    dragStart.current = p;
    setRegion({ x: p.x, y: p.y, w: 0, h: 0 });
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const p = frac(e);
    const s = dragStart.current;
    setRegion({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStart.current) return;
      const p = frac(e);
      const s = dragStart.current;
      const r: Region = {
        x: Math.min(s.x, p.x),
        y: Math.min(s.y, p.y),
        w: Math.abs(p.x - s.x),
        h: Math.abs(p.y - s.y),
      };
      dragStart.current = null;
      // Ignore accidental tiny drags.
      if (r.w < 0.02 || r.h < 0.02) {
        setRegion(null);
        return;
      }
      const pxRegion = {
        x: Math.round(r.x * 3840),
        y: Math.round(r.y * 2160),
        w: Math.round(r.w * 3840),
        h: Math.round(r.h * 2160),
      };
      const captured = actions.addCapture('area', pxRegion);
      setShot(captured);
      setRegion(r);
      setPhase('preview');
    },
    [actions],
  );

  return {
    phase,
    mode,
    region,
    shot,
    start,
    choose,
    reset,
    selectionProps: { onPointerDown, onPointerMove, onPointerUp },
  };
}

// A believable fake screenshot: gradient backdrop with mock window chrome.
export function MockScreenshot({
  shot,
  className,
  style,
  crop,
}: {
  shot: CaptureShot;
  className?: string;
  style?: React.CSSProperties;
  crop?: Region | null;
}) {
  const [a, b, c] = shot.gradient;
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `radial-gradient(120% 120% at 12% 8%, ${a} 0%, ${b} 48%, ${c} 100%)`,
        ...style,
      }}
    >
      {/* fake desktop chrome so it reads as a real screen grab */}
      <div
        style={{
          position: 'absolute',
          inset: '8% 10%',
          borderRadius: 14,
          background: 'rgba(255,255,255,0.10)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.22)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', gap: 6, padding: 12 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((d) => (
            <span key={d} style={{ width: 11, height: 11, borderRadius: 999, background: d }} />
          ))}
        </div>
        <div style={{ padding: '0 16px', display: 'grid', gap: 8 }}>
          <div style={{ height: 10, width: '52%', borderRadius: 6, background: 'rgba(255,255,255,0.5)' }} />
          <div style={{ height: 8, width: '78%', borderRadius: 6, background: 'rgba(255,255,255,0.28)' }} />
          <div style={{ height: 8, width: '64%', borderRadius: 6, background: 'rgba(255,255,255,0.22)' }} />
          <div style={{ height: 8, width: '70%', borderRadius: 6, background: 'rgba(255,255,255,0.18)' }} />
        </div>
      </div>
      {crop && (
        <div
          style={{
            position: 'absolute',
            left: `${crop.x * 100}%`,
            top: `${crop.y * 100}%`,
            width: `${crop.w * 100}%`,
            height: `${crop.h * 100}%`,
            outline: '2px solid rgba(255,255,255,0.9)',
            boxShadow: '0 0 0 4000px rgba(0,0,0,0.45)',
          }}
        />
      )}
    </div>
  );
}
