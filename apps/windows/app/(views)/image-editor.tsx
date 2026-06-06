import { useEffect, useReducer, useRef, useState } from 'react';
import Pica from 'pica';
import { listen } from '@tauri-apps/api/event';
import { Check, Lock, RotateCcw, Save, Unlock, X } from '@pane/ui';
import {
  hideImageEditor,
  saveEditedCaptureToDesktop,
  takeLatestCaptureFull,
} from '@/lib/commands';
import { useEffectEvent } from '@/lib/use-effect-event';

// Pure-JS pica: the app's CSP forbids wasm/eval and blob web workers, so the
// default ['js','wasm','ww'] feature set would fail. Lanczos in plain JS is
// plenty fast for one screenshot.
const pica = new Pica({ features: ['js'] });

const SCALE_PRESETS = [0.25, 0.5, 0.75, 1] as const;

// Eight drag handles around the image. The letters are compass points, so a
// handle's name encodes which axes it drives: any 'e'/'w' resizes width, any
// 'n'/'s' resizes height, and corners ('nw'…'se') drive both.
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface Drag {
  handle: Handle;
  // Frame centre in client px, captured at drag start. Resize is symmetric
  // about the centre, so this stays fixed for the whole gesture.
  cx: number;
  cy: number;
}

type SaveState = 'idle' | 'busy' | 'success';

interface Dimensions {
  width: number;
  height: number;
}

interface EditorState {
  src: string | null;
  base: Dimensions | null;
  width: number;
  height: number;
  lockAspect: boolean;
  save: SaveState;
  savedPath?: string;
  error?: string;
}

type EditorAction =
  | { type: 'capture-loaded'; src: string }
  | { type: 'capture-error'; error: string }
  | { type: 'image-loaded'; size: Dimensions }
  | { type: 'resize'; width: number; height: number }
  | { type: 'change-width'; width: number }
  | { type: 'change-height'; height: number }
  | { type: 'scale'; scale: number }
  | { type: 'reset' }
  | { type: 'toggle-aspect' }
  | { type: 'save-start' }
  | { type: 'save-success'; path: string }
  | { type: 'save-error'; error: string };

const initialEditorState: EditorState = {
  src: null,
  base: null,
  width: 0,
  height: 0,
  lockAspect: true,
  save: 'idle',
};

function clampDimension(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(20000, Math.max(1, Math.round(value)));
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'capture-loaded':
      return {
        ...state,
        src: action.src,
        error: undefined,
        save: 'idle',
        savedPath: undefined,
      };
    case 'capture-error':
      return { ...state, error: action.error };
    case 'image-loaded':
      return {
        ...state,
        base: action.size,
        width: action.size.width,
        height: action.size.height,
      };
    case 'resize':
      return {
        ...state,
        width: action.width,
        height: action.height,
        save: 'idle',
      };
    case 'change-width': {
      const width = clampDimension(action.width);
      return {
        ...state,
        width,
        height:
          state.lockAspect && state.base
            ? clampDimension((width * state.base.height) / state.base.width)
            : state.height,
        save: 'idle',
      };
    }
    case 'change-height': {
      const height = clampDimension(action.height);
      return {
        ...state,
        width:
          state.lockAspect && state.base
            ? clampDimension((height * state.base.width) / state.base.height)
            : state.width,
        height,
        save: 'idle',
      };
    }
    case 'scale':
      return state.base
        ? {
            ...state,
            width: clampDimension(state.base.width * action.scale),
            height: clampDimension(state.base.height * action.scale),
            save: 'idle',
          }
        : state;
    case 'reset':
      return state.base
        ? {
            ...state,
            width: state.base.width,
            height: state.base.height,
            save: 'idle',
          }
        : state;
    case 'toggle-aspect':
      return { ...state, lockAspect: !state.lockAspect };
    case 'save-start':
      return { ...state, save: 'busy', error: undefined };
    case 'save-success':
      return { ...state, savedPath: action.path, save: 'success' };
    case 'save-error':
      return { ...state, save: 'idle', error: action.error };
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read blob.'));
    reader.readAsDataURL(blob);
  });
}

export default function ImageEditorPage() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const { src, base, width, height, lockAspect, save, savedPath, error } =
    state;

  const imgRef = useRef<HTMLImageElement>(null);

  function fetchCapture() {
    return takeLatestCaptureFull()
      .then((c) => {
        dispatch({ type: 'capture-loaded', src: c.dataUrl });
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

  // The decoded data URL is the working source, so size controls track the
  // image's real pixels rather than the (possibly larger) original capture.
  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    dispatch({
      type: 'image-loaded',
      size: { width: img.naturalWidth, height: img.naturalHeight },
    });
  }

  // Drag handles (and the field/preset writers) all funnel through here.
  function applyResize(w: number, h: number) {
    dispatch({ type: 'resize', width: w, height: h });
  }

  function changeWidth(next: number) {
    dispatch({ type: 'change-width', width: next });
  }

  function changeHeight(next: number) {
    dispatch({ type: 'change-height', height: next });
  }

  function applyScale(scale: number) {
    dispatch({ type: 'scale', scale });
  }

  function reset() {
    dispatch({ type: 'reset' });
  }

  async function onSave() {
    const img = imgRef.current;
    if (!img || !base || save === 'busy') return;
    dispatch({ type: 'save-start' });
    try {
      const dest = document.createElement('canvas');
      dest.width = width;
      dest.height = height;
      await pica.resize(img, dest, { filter: 'lanczos3' });
      const blob = await pica.toBlob(dest, 'image/png');
      const dataUrl = await blobToDataUrl(blob);
      const path = await saveEditedCaptureToDesktop(dataUrl);
      dispatch({ type: 'save-success', path });
    } catch (e) {
      dispatch({ type: 'save-error', error: String(e) });
    }
  }

  const unchanged = !!base && width === base.width && height === base.height;

  return (
    <div className="image-editor-root">
      <div className="image-editor-header" data-tauri-drag-region>
        <span className="image-editor-title">Edit capture</span>
        <button
          type="button"
          onClick={() => void hideImageEditor()}
          className="image-editor-close"
          aria-label="Close editor"
        >
          <X aria-hidden size={16} />
        </button>
      </div>

      <div className="image-editor-body">
        <ResizeStage
          src={src}
          base={base}
          width={width}
          height={height}
          lockAspect={lockAspect}
          error={error}
          imgRef={imgRef}
          onImageLoad={onImageLoad}
          onResize={applyResize}
        />

        <div className="image-editor-panel">
          <h2 className="image-editor-section">Resize</h2>

          <label className="image-editor-field">
            <span>Width</span>
            <div className="image-editor-input-wrap">
              <input
                type="number"
                min={1}
                value={width || ''}
                onChange={(e) => changeWidth(e.currentTarget.valueAsNumber)}
                className="image-editor-input"
              />
              <span className="image-editor-unit">px</span>
            </div>
          </label>

          <label className="image-editor-field">
            <span>Height</span>
            <div className="image-editor-input-wrap">
              <input
                type="number"
                min={1}
                value={height || ''}
                onChange={(e) => changeHeight(e.currentTarget.valueAsNumber)}
                className="image-editor-input"
              />
              <span className="image-editor-unit">px</span>
            </div>
          </label>

          <button
            type="button"
            onClick={() => dispatch({ type: 'toggle-aspect' })}
            className="image-editor-lock"
            aria-pressed={lockAspect}
          >
            {lockAspect ? (
              <Lock aria-hidden size={14} />
            ) : (
              <Unlock aria-hidden size={14} />
            )}
            {lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
          </button>

          <div className="image-editor-presets">
            {SCALE_PRESETS.map((scale) => (
              <button
                key={scale}
                type="button"
                disabled={!base}
                onClick={() => applyScale(scale)}
                className="image-editor-preset"
              >
                {scale * 100}%
              </button>
            ))}
          </div>

          <div className="image-editor-spacer" />

          {savedPath ? (
            <p className="image-editor-saved">Saved to Desktop</p>
          ) : null}

          <div className="image-editor-actions">
            <button
              type="button"
              onClick={reset}
              disabled={!base || unchanged}
              className="image-editor-btn image-editor-btn-ghost"
            >
              <RotateCcw aria-hidden size={14} />
              Reset
            </button>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={!base || save === 'busy'}
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
                  ? 'Saving…'
                  : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// The image stage with drag-to-resize handles. Owns the display-fit scale and
// the in-flight gesture; reports new pixel dimensions up via `onResize`.
function ResizeStage({
  src,
  base,
  width,
  height,
  lockAspect,
  error,
  imgRef,
  onImageLoad,
  onResize,
}: {
  src: string | null;
  base: Dimensions | null;
  width: number;
  height: number;
  lockAspect: boolean;
  error?: string;
  imgRef: React.RefObject<HTMLImageElement | null>;
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onResize: (width: number, height: number) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  // Ratio of on-screen px to image px, so a large capture fits the stage while
  // the handles still map drag distance back to real pixels. 1 = shown 1:1.
  const [fit, setFit] = useState(1);
  const dragRef = useRef<Drag | null>(null);

  // Fit the *original* image into the stage (never upscale past 1:1). Keyed on
  // base so the reference stays stable mid-drag — basing it on the live size
  // would make the frame refit and fight the pointer. Recomputes on resize.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !base) return;
    const compute = () => {
      const pad = 40; // matches .image-editor-stage padding (20px each side)
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

  function onHandleDown(
    e: React.PointerEvent<HTMLSpanElement>,
    handle: Handle,
  ) {
    if (!base || !imgRef.current) return;
    e.preventDefault();
    const rect = imgRef.current.getBoundingClientRect();
    dragRef.current = {
      handle,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onHandleMove(e: React.PointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current;
    if (!drag || !base || fit <= 0) return;
    const horiz = drag.handle.includes('e') || drag.handle.includes('w');
    const vert = drag.handle.includes('n') || drag.handle.includes('s');
    // Pointer distance from the fixed centre → full dimension (both edges move).
    const w = (Math.abs(e.clientX - drag.cx) * 2) / fit;
    const h = (Math.abs(e.clientY - drag.cy) * 2) / fit;
    if (lockAspect) {
      // Drive a uniform scale off whichever axis the handle (and pointer) leads.
      const scale =
        horiz && vert
          ? Math.max(w / base.width, h / base.height)
          : horiz
            ? w / base.width
            : h / base.height;
      onResize(
        clampDimension(base.width * scale),
        clampDimension(base.height * scale),
      );
    } else {
      onResize(
        horiz ? clampDimension(w) : width,
        vert ? clampDimension(h) : height,
      );
    }
  }

  function onHandleUp(e: React.PointerEvent<HTMLSpanElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <div className="image-editor-stage" ref={stageRef}>
      {error ? <p className="image-editor-error">{error}</p> : null}
      {src ? (
        <div
          className="image-editor-frame"
          style={
            base ? { width: width * fit, height: height * fit } : undefined
          }
        >
          <img
            ref={imgRef}
            src={src}
            alt="Capture to edit"
            draggable={false}
            onLoad={onImageLoad}
            className="image-editor-preview"
            style={base ? { width: '100%', height: '100%' } : undefined}
          />
          {base
            ? HANDLES.map((h) => (
                <span
                  key={h}
                  className="image-editor-handle"
                  data-pos={h}
                  onPointerDown={(e) => onHandleDown(e, h)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                  onPointerCancel={onHandleUp}
                />
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
