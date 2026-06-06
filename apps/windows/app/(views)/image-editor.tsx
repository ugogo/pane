import { useEffect, useReducer, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Check, RotateCcw, Save, X } from '@pane/ui';
import {
  commitLatestCaptureEdit,
  hideImageEditor,
  takeLatestCaptureEdit,
} from '@/lib/commands';
import { useEffectEvent } from '@/lib/use-effect-event';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type SaveState = 'idle' | 'busy' | 'success';

interface Dimensions {
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DrawDrag {
  type: 'draw';
  start: Point;
}

interface ResizeDrag {
  type: 'resize';
  handle: Handle;
  startCrop: Rect;
}

interface MoveDrag {
  type: 'move';
  start: Point;
  startCrop: Rect;
}

type Drag = DrawDrag | ResizeDrag | MoveDrag;

interface EditorState {
  src: string | null;
  base: Dimensions | null;
  crop: Rect | null;
  save: SaveState;
  error?: string;
}

type EditorAction =
  | { type: 'capture-loaded'; src: string; size: Dimensions; crop: Rect }
  | { type: 'capture-error'; error: string }
  | { type: 'set-crop'; crop: Rect }
  | { type: 'reset' }
  | { type: 'save-start' }
  | { type: 'save-success' }
  | { type: 'save-error'; error: string };

const initialEditorState: EditorState = {
  src: null,
  base: null,
  crop: null,
  save: 'idle',
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundRect(rect: Rect): Rect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
  };
}

function rectFrom(a: Point, b: Point, base: Dimensions): Rect {
  const x1 = clamp(a.x, 0, base.width);
  const y1 = clamp(a.y, 0, base.height);
  const x2 = clamp(b.x, 0, base.width);
  const y2 = clamp(b.y, 0, base.height);
  return roundRect({
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x1 - x2),
    h: Math.abs(y1 - y2),
  });
}

function clampCrop(rect: Rect, base: Dimensions): Rect {
  const x = clamp(rect.x, 0, base.width);
  const y = clamp(rect.y, 0, base.height);
  return roundRect({
    x,
    y,
    w: clamp(rect.w, 1, base.width - x),
    h: clamp(rect.h, 1, base.height - y),
  });
}

function resizeCrop(
  crop: Rect,
  handle: Handle,
  point: Point,
  base: Dimensions,
) {
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.w;
  let bottom = crop.y + crop.h;

  if (handle.includes('w')) left = point.x;
  if (handle.includes('e')) right = point.x;
  if (handle.includes('n')) top = point.y;
  if (handle.includes('s')) bottom = point.y;

  return rectFrom({ x: left, y: top }, { x: right, y: bottom }, base);
}

function moveCrop(crop: Rect, start: Point, point: Point, base: Dimensions) {
  return roundRect({
    ...crop,
    x: clamp(crop.x + point.x - start.x, 0, base.width - crop.w),
    y: clamp(crop.y + point.y - start.y, 0, base.height - crop.h),
  });
}

function rectContains(rect: Rect, point: Point) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

function fillsBase(rect: Rect, base: Dimensions) {
  return (
    rect.x === 0 &&
    rect.y === 0 &&
    rect.w === base.width &&
    rect.h === base.height
  );
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'capture-loaded':
      return {
        ...state,
        src: action.src,
        base: action.size,
        crop: action.crop,
        error: undefined,
        save: 'idle',
      };
    case 'capture-error':
      return { ...state, error: action.error };
    case 'set-crop':
      return { ...state, crop: action.crop, save: 'idle' };
    case 'reset':
      return state.base
        ? {
            ...state,
            crop: {
              x: 0,
              y: 0,
              w: state.base.width,
              h: state.base.height,
            },
            save: 'idle',
          }
        : state;
    case 'save-start':
      return { ...state, save: 'busy', error: undefined };
    case 'save-success':
      return { ...state, save: 'success' };
    case 'save-error':
      return { ...state, save: 'idle', error: action.error };
  }
}

export default function ImageEditorPage() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const { src, base, crop, save, error } = state;

  function fetchCapture() {
    return takeLatestCaptureEdit()
      .then((c) => {
        dispatch({
          type: 'capture-loaded',
          src: c.dataUrl,
          size: { width: c.width, height: c.height },
          crop: {
            x: c.crop.x,
            y: c.crop.y,
            w: c.crop.width,
            h: c.crop.height,
          },
        });
      })
      .catch((e: unknown) =>
        dispatch({ type: 'capture-error', error: String(e) }),
      );
  }

  const onFetch = useEffectEvent(() => void fetchCapture());

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  useEffect(() => {
    onFetch();

    const unlisten = listen('refresh-capture', () => {
      onFetch();
    });

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Escape') {
        e.preventDefault();
        void hideImageEditor();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      void unlisten.then((u) => u());
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  function setCrop(next: Rect) {
    if (!base) return;
    dispatch({ type: 'set-crop', crop: clampCrop(next, base) });
  }

  async function onSave() {
    if (!base || !crop || crop.w < 1 || crop.h < 1 || save === 'busy') {
      return;
    }
    dispatch({ type: 'save-start' });
    try {
      await commitLatestCaptureEdit(crop.x, crop.y, crop.w, crop.h);
      dispatch({ type: 'save-success' });
    } catch (e) {
      dispatch({ type: 'save-error', error: String(e) });
    }
  }

  const unchanged =
    !!base &&
    !!crop &&
    crop.x === 0 &&
    crop.y === 0 &&
    crop.w === base.width &&
    crop.h === base.height;

  return (
    <div className="image-editor-root">
      <div
        className="image-editor-header"
        data-tauri-drag-region
        role="presentation"
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement;
          if (target.closest('button')) return;
          void getCurrentWindow().startDragging().catch(console.error);
        }}
      >
        <span className="image-editor-title">Edit capture</span>
        <div className="window-action-bar image-editor-action-bar">
          <button
            type="button"
            onClick={() => void hideImageEditor()}
            className="window-action-control window-action-control-close image-editor-action-control"
            aria-label="Close editor"
          >
            <X aria-hidden size={16} />
          </button>
        </div>
      </div>

      <div className="image-editor-body">
        <CropStage
          src={src}
          base={base}
          crop={crop}
          error={error}
          onCrop={setCrop}
        />

        <div className="image-editor-panel">
          <h2 className="image-editor-section">Crop</h2>

          <div className="image-editor-crop-grid">
            <CropField
              label="X"
              value={crop?.x ?? 0}
              disabled={!base || !crop}
              onChange={(x) => crop && setCrop({ ...crop, x })}
            />
            <CropField
              label="Y"
              value={crop?.y ?? 0}
              disabled={!base || !crop}
              onChange={(y) => crop && setCrop({ ...crop, y })}
            />
            <CropField
              label="Width"
              value={crop?.w ?? 0}
              disabled={!base || !crop}
              onChange={(w) => crop && setCrop({ ...crop, w })}
            />
            <CropField
              label="Height"
              value={crop?.h ?? 0}
              disabled={!base || !crop}
              onChange={(h) => crop && setCrop({ ...crop, h })}
            />
          </div>

          <div className="image-editor-spacer" />

          <div className="image-editor-actions">
            <button
              type="button"
              onClick={() => dispatch({ type: 'reset' })}
              disabled={!base || unchanged}
              className="image-editor-btn image-editor-btn-ghost"
            >
              <RotateCcw aria-hidden size={14} />
              Reset
            </button>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={
                !base || !crop || crop.w < 1 || crop.h < 1 || save === 'busy'
              }
              className="image-editor-btn image-editor-btn-primary"
            >
              {save === 'success' ? (
                <Check aria-hidden size={14} />
              ) : (
                <Save aria-hidden size={14} />
              )}
              {save === 'success'
                ? 'Saved'
                : save === 'busy'
                  ? 'Saving...'
                  : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CropField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="image-editor-field">
      <span>{label}</span>
      <div className="image-editor-input-wrap">
        <input
          type="number"
          min={label === 'X' || label === 'Y' ? 0 : 1}
          value={Number.isFinite(value) ? value : ''}
          disabled={disabled}
          onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
          className="image-editor-input"
        />
        <span className="image-editor-unit">px</span>
      </div>
    </label>
  );
}

function CropStage({
  src,
  base,
  crop,
  error,
  onCrop,
}: {
  src: string | null;
  base: Dimensions | null;
  crop: Rect | null;
  error?: string;
  onCrop: (crop: Rect) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !base) return;
    const compute = () => {
      const pad = 40;
      const availW = stage.clientWidth - pad;
      const availH = stage.clientHeight - pad;
      const f = Math.min(availW / base.width, availH / base.height, 1);
      setFit(f > 0 && Number.isFinite(f) ? f : 1);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [base]);

  function pointFromEvent(e: React.PointerEvent) {
    const frame = frameRef.current;
    if (!frame || !base || fit <= 0) return null;
    const rect = frame.getBoundingClientRect();
    return {
      x: clamp((e.clientX - rect.left) / fit, 0, base.width),
      y: clamp((e.clientY - rect.top) / fit, 0, base.height),
    };
  }

  function onFrameDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!base) return;
    const point = pointFromEvent(e);
    if (!point) return;
    e.preventDefault();
    if (crop && !fillsBase(crop, base) && rectContains(crop, point)) {
      dragRef.current = { type: 'move', start: point, startCrop: crop };
    } else {
      dragRef.current = { type: 'draw', start: point };
      onCrop(rectFrom(point, point, base));
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onFrameMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !base) return;
    const point = pointFromEvent(e);
    if (!point) return;
    if (drag.type === 'draw') {
      onCrop(rectFrom(drag.start, point, base));
    } else if (drag.type === 'resize') {
      onCrop(resizeCrop(drag.startCrop, drag.handle, point, base));
    } else {
      onCrop(moveCrop(drag.startCrop, drag.start, point, base));
    }
  }

  function endFrameDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function onHandleDown(
    e: React.PointerEvent<HTMLSpanElement>,
    handle: Handle,
  ) {
    if (!crop) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { type: 'resize', handle, startCrop: crop };
    const frame = frameRef.current;
    frame?.setPointerCapture(e.pointerId);
  }

  const displayCrop = crop && crop.w > 0 && crop.h > 0 ? crop : null;

  return (
    <div className="image-editor-stage" ref={stageRef}>
      {error ? <p className="image-editor-error">{error}</p> : null}
      {src ? (
        <div
          ref={frameRef}
          className="image-editor-frame"
          style={
            base
              ? { width: base.width * fit, height: base.height * fit }
              : undefined
          }
          onPointerDown={onFrameDown}
          onPointerMove={onFrameMove}
          onPointerUp={endFrameDrag}
          onPointerCancel={endFrameDrag}
        >
          <img
            src={src}
            alt="Capture to edit"
            draggable={false}
            className="image-editor-preview"
          />
          {displayCrop ? (
            <div
              className="image-editor-selection"
              style={{
                left: displayCrop.x * fit,
                top: displayCrop.y * fit,
                width: displayCrop.w * fit,
                height: displayCrop.h * fit,
              }}
            >
              {HANDLES.map((h) => (
                <span
                  key={h}
                  className="image-editor-handle"
                  data-pos={h}
                  onPointerDown={(e) => onHandleDown(e, h)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
