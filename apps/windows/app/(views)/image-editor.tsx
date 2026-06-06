import { useEffect, useReducer, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  ArrowUpRight,
  Check,
  Crop as CropIcon,
  Highlighter,
  Pencil,
  RectangleHorizontal,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  X,
} from '@pane/ui';
import {
  commitLatestCaptureEdit,
  hideImageEditor,
  replaceLatestCaptureWithEdit,
  takeLatestCaptureEdit,
} from '@/lib/commands';
import { useEffectEvent } from '@/lib/use-effect-event';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type SaveState = 'idle' | 'busy' | 'success';
type Tool = 'crop' | 'arrow' | 'rect' | 'highlight' | 'pen';

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

type Annotation =
  | {
      id: string;
      kind: 'arrow';
      from: Point;
      to: Point;
      color: string;
      width: number;
    }
  | { id: string; kind: 'rect'; rect: Rect; color: string; width: number }
  | {
      id: string;
      kind: 'highlight';
      rect: Rect;
      color: string;
      opacity: number;
    }
  | { id: string; kind: 'pen'; points: Point[]; color: string; width: number };

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

interface AnnotationDrag {
  type: 'annotation';
  tool: Exclude<Tool, 'crop'>;
  start: Point;
}

type Drag = DrawDrag | ResizeDrag | MoveDrag | AnnotationDrag;

interface EditorState {
  src: string | null;
  sessionId: number | null;
  base: Dimensions | null;
  crop: Rect | null;
  annotations: Annotation[];
  redo: Annotation[];
  draft: Annotation | null;
  tool: Tool;
  color: string;
  strokeWidth: number;
  save: SaveState;
  error?: string;
}

type EditorAction =
  | {
      type: 'capture-loaded';
      src: string;
      sessionId: number;
      size: Dimensions;
      crop: Rect;
    }
  | { type: 'capture-error'; error: string }
  | { type: 'set-tool'; tool: Tool }
  | { type: 'set-color'; color: string }
  | { type: 'set-width'; width: number }
  | { type: 'set-crop'; crop: Rect }
  | { type: 'set-draft'; draft: Annotation | null }
  | { type: 'commit-annotation'; annotation: Annotation }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' }
  | { type: 'save-start' }
  | { type: 'save-success' }
  | { type: 'save-error'; error: string };

const initialEditorState: EditorState = {
  src: null,
  sessionId: null,
  base: null,
  crop: null,
  annotations: [],
  redo: [],
  draft: null,
  tool: 'crop',
  color: '#38bdf8',
  strokeWidth: 5,
  save: 'idle',
};

const TOOLS: Array<{
  id: Tool;
  label: string;
  icon: typeof CropIcon;
}> = [
  { id: 'crop', label: 'Crop', icon: CropIcon },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'rect', label: 'Rectangle', icon: RectangleHorizontal },
  { id: 'highlight', label: 'Highlight', icon: Highlighter },
  { id: 'pen', label: 'Pen', icon: Pencil },
];

const SWATCHES = ['#38bdf8', '#f43f5e', '#facc15', '#22c55e', '#f8fafc'];

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

function makeAnnotationId() {
  return `annotation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function annotationFromDrag(
  tool: Exclude<Tool, 'crop'>,
  start: Point,
  point: Point,
  base: Dimensions,
  color: string,
  strokeWidth: number,
  previous?: Annotation | null,
): Annotation | null {
  if (tool === 'pen') {
    const points =
      previous?.kind === 'pen' ? [...previous.points, point] : [start, point];
    return {
      id: previous?.id ?? makeAnnotationId(),
      kind: 'pen',
      points,
      color,
      width: strokeWidth,
    };
  }

  const rect = rectFrom(start, point, base);
  if (tool === 'rect') {
    return {
      id: previous?.id ?? makeAnnotationId(),
      kind: 'rect',
      rect,
      color,
      width: strokeWidth,
    };
  }
  if (tool === 'highlight') {
    return {
      id: previous?.id ?? makeAnnotationId(),
      kind: 'highlight',
      rect,
      color,
      opacity: 0.35,
    };
  }
  return {
    id: previous?.id ?? makeAnnotationId(),
    kind: 'arrow',
    from: start,
    to: point,
    color,
    width: strokeWidth,
  };
}

function isDrawableAnnotation(annotation: Annotation) {
  if (annotation.kind === 'arrow') {
    return (
      Math.abs(annotation.to.x - annotation.from.x) > 2 ||
      Math.abs(annotation.to.y - annotation.from.y) > 2
    );
  }
  if (annotation.kind === 'pen') return annotation.points.length > 2;
  if (annotation.kind === 'highlight') {
    return annotation.rect.w > 2 && annotation.rect.h > 2;
  }
  return annotation.rect.w > 2 && annotation.rect.h > 2;
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'capture-loaded':
      return {
        ...state,
        src: action.src,
        sessionId: action.sessionId,
        base: action.size,
        crop: action.crop,
        annotations: [],
        redo: [],
        draft: null,
        error: undefined,
        save: 'idle',
      };
    case 'capture-error':
      return { ...state, error: action.error };
    case 'set-tool':
      return { ...state, tool: action.tool, draft: null };
    case 'set-color':
      return { ...state, color: action.color };
    case 'set-width':
      return { ...state, strokeWidth: action.width };
    case 'set-crop':
      return { ...state, crop: action.crop, save: 'idle' };
    case 'set-draft':
      return { ...state, draft: action.draft, save: 'idle' };
    case 'commit-annotation':
      return {
        ...state,
        annotations: [...state.annotations, action.annotation],
        redo: [],
        draft: null,
        save: 'idle',
      };
    case 'undo': {
      const annotation = state.annotations[state.annotations.length - 1];
      if (!annotation) return state;
      return {
        ...state,
        annotations: state.annotations.slice(0, -1),
        redo: [annotation, ...state.redo],
        draft: null,
        save: 'idle',
      };
    }
    case 'redo': {
      const [annotation, ...redo] = state.redo;
      if (!annotation) return state;
      return {
        ...state,
        annotations: [...state.annotations, annotation],
        redo,
        draft: null,
        save: 'idle',
      };
    }
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
            annotations: [],
            redo: [],
            draft: null,
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

function drawAnnotation(ctx: CanvasRenderingContext2D, annotation: Annotation) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (annotation.kind === 'highlight') {
    ctx.globalAlpha = annotation.opacity;
    ctx.fillStyle = annotation.color;
    ctx.fillRect(
      annotation.rect.x,
      annotation.rect.y,
      annotation.rect.w,
      annotation.rect.h,
    );
    ctx.restore();
    return;
  }

  ctx.strokeStyle = annotation.color;
  ctx.fillStyle = annotation.color;

  if (annotation.kind === 'arrow') {
    ctx.lineWidth = annotation.width;
    ctx.beginPath();
    ctx.moveTo(annotation.from.x, annotation.from.y);
    ctx.lineTo(annotation.to.x, annotation.to.y);
    ctx.stroke();

    const angle = Math.atan2(
      annotation.to.y - annotation.from.y,
      annotation.to.x - annotation.from.x,
    );
    const head = Math.max(12, annotation.width * 3.5);
    ctx.beginPath();
    ctx.moveTo(annotation.to.x, annotation.to.y);
    ctx.lineTo(
      annotation.to.x - head * Math.cos(angle - Math.PI / 6),
      annotation.to.y - head * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      annotation.to.x - head * Math.cos(angle + Math.PI / 6),
      annotation.to.y - head * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  } else if (annotation.kind === 'rect') {
    ctx.lineWidth = annotation.width;
    ctx.strokeRect(
      annotation.rect.x,
      annotation.rect.y,
      annotation.rect.w,
      annotation.rect.h,
    );
  } else if (annotation.kind === 'pen') {
    ctx.lineWidth = annotation.width;
    ctx.beginPath();
    annotation.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
  }

  ctx.restore();
}

function drawEditorCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  base: Dimensions,
  annotations: Annotation[],
  draft: Annotation | null,
) {
  if (canvas.width !== base.width) canvas.width = base.width;
  if (canvas.height !== base.height) canvas.height = base.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, base.width, base.height);
  ctx.drawImage(image, 0, 0, base.width, base.height);
  annotations.forEach((annotation) => drawAnnotation(ctx, annotation));
  if (draft) drawAnnotation(ctx, draft);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load capture image.'));
    img.src = src;
  });
}

async function rasterizeEdit(
  src: string,
  base: Dimensions,
  crop: Rect,
  annotations: Annotation[],
) {
  const image = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = crop.w;
  canvas.height = crop.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to prepare edited image.');

  ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  ctx.save();
  ctx.translate(-crop.x, -crop.y);
  ctx.beginPath();
  ctx.rect(crop.x, crop.y, crop.w, crop.h);
  ctx.clip();
  annotations.forEach((annotation) => drawAnnotation(ctx, annotation));
  ctx.restore();

  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl.startsWith('data:image/png')) {
    throw new Error('Edited image export failed.');
  }
  if (base.width < 1 || base.height < 1) {
    throw new Error('Capture dimensions are invalid.');
  }
  return dataUrl;
}

export default function ImageEditorPage() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const {
    src,
    sessionId,
    base,
    crop,
    annotations,
    redo,
    draft,
    tool,
    color,
    strokeWidth,
    save,
    error,
  } = state;

  function fetchCapture() {
    return takeLatestCaptureEdit()
      .then((c) => {
        dispatch({
          type: 'capture-loaded',
          src: c.dataUrl,
          sessionId: c.sessionId,
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
  const onUndo = useEffectEvent(() => dispatch({ type: 'undo' }));
  const onRedo = useEffectEvent(() => dispatch({ type: 'redo' }));

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
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        onRedo();
        return;
      }
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
    if (
      sessionId === null ||
      !src ||
      !base ||
      !crop ||
      crop.w < 1 ||
      crop.h < 1 ||
      save === 'busy'
    ) {
      return;
    }
    dispatch({ type: 'save-start' });
    try {
      if (annotations.length === 0) {
        await commitLatestCaptureEdit(
          sessionId,
          crop.x,
          crop.y,
          crop.w,
          crop.h,
        );
      } else {
        const dataUrl = await rasterizeEdit(src, base, crop, annotations);
        await Promise.all([
          replaceLatestCaptureWithEdit(dataUrl),
          hideImageEditor(),
        ]);
      }
      dispatch({ type: 'save-success' });
    } catch (e) {
      dispatch({ type: 'save-error', error: String(e) });
    }
  }

  const unchanged =
    !!base &&
    !!crop &&
    annotations.length === 0 &&
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
        <EditorStage
          src={src}
          base={base}
          crop={crop}
          annotations={annotations}
          draft={draft}
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          error={error}
          onCrop={setCrop}
          onDraft={(nextDraft) =>
            dispatch({ type: 'set-draft', draft: nextDraft })
          }
          onCommitAnnotation={(annotation) =>
            dispatch({ type: 'commit-annotation', annotation })
          }
        />

        <EditorPanel
          base={base}
          crop={crop}
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          annotations={annotations}
          redo={redo}
          save={save}
          unchanged={unchanged}
          onTool={(nextTool) => dispatch({ type: 'set-tool', tool: nextTool })}
          onColor={(nextColor) =>
            dispatch({ type: 'set-color', color: nextColor })
          }
          onWidth={(width) => dispatch({ type: 'set-width', width })}
          onCrop={setCrop}
          onUndo={() => dispatch({ type: 'undo' })}
          onRedo={() => dispatch({ type: 'redo' })}
          onReset={() => dispatch({ type: 'reset' })}
          onSave={() => void onSave()}
        />
      </div>
    </div>
  );
}

function EditorPanel({
  base,
  crop,
  tool,
  color,
  strokeWidth,
  annotations,
  redo,
  save,
  unchanged,
  onTool,
  onColor,
  onWidth,
  onCrop,
  onUndo,
  onRedo,
  onReset,
  onSave,
}: {
  base: Dimensions | null;
  crop: Rect | null;
  tool: Tool;
  color: string;
  strokeWidth: number;
  annotations: Annotation[];
  redo: Annotation[];
  save: SaveState;
  unchanged: boolean;
  onTool: (tool: Tool) => void;
  onColor: (color: string) => void;
  onWidth: (width: number) => void;
  onCrop: (crop: Rect) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="image-editor-panel">
      <h2 className="image-editor-section">Tools</h2>
      <div className="image-editor-tool-grid">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={tool === id}
            onClick={() => onTool(id)}
            className="image-editor-tool"
          >
            <Icon aria-hidden size={16} />
          </button>
        ))}
      </div>

      <div className="image-editor-inline-actions">
        <button
          type="button"
          title="Undo"
          aria-label="Undo"
          onClick={onUndo}
          disabled={annotations.length === 0}
          className="image-editor-icon-btn"
        >
          <Undo2 aria-hidden size={15} />
        </button>
        <button
          type="button"
          title="Redo"
          aria-label="Redo"
          onClick={onRedo}
          disabled={redo.length === 0}
          className="image-editor-icon-btn"
        >
          <Redo2 aria-hidden size={15} />
        </button>
      </div>

      <h2 className="image-editor-section">Style</h2>
      <div className="image-editor-swatch-row">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            title={swatch}
            aria-label={`Use ${swatch}`}
            aria-pressed={color === swatch}
            onClick={() => onColor(swatch)}
            className="image-editor-swatch"
            style={{ background: swatch }}
          />
        ))}
      </div>
      <label className="image-editor-range-field">
        <span>Stroke</span>
        <input
          type="range"
          min={2}
          max={18}
          step={1}
          value={strokeWidth}
          onChange={(e) => onWidth(e.currentTarget.valueAsNumber)}
          className="image-editor-range"
        />
        <output>{strokeWidth}px</output>
      </label>

      <h2 className="image-editor-section">Crop</h2>
      <div className="image-editor-crop-grid">
        <CropField
          label="X"
          value={crop?.x ?? 0}
          disabled={!base || !crop}
          onChange={(x) => crop && onCrop({ ...crop, x })}
        />
        <CropField
          label="Y"
          value={crop?.y ?? 0}
          disabled={!base || !crop}
          onChange={(y) => crop && onCrop({ ...crop, y })}
        />
        <CropField
          label="Width"
          value={crop?.w ?? 0}
          disabled={!base || !crop}
          onChange={(w) => crop && onCrop({ ...crop, w })}
        />
        <CropField
          label="Height"
          value={crop?.h ?? 0}
          disabled={!base || !crop}
          onChange={(h) => crop && onCrop({ ...crop, h })}
        />
      </div>

      <div className="image-editor-spacer" />

      <div className="image-editor-actions">
        <button
          type="button"
          onClick={onReset}
          disabled={!base || unchanged}
          className="image-editor-btn image-editor-btn-ghost"
        >
          <RotateCcw aria-hidden size={14} />
          Reset
        </button>
        <button
          type="button"
          onClick={onSave}
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

function EditorStage({
  src,
  base,
  crop,
  annotations,
  draft,
  tool,
  color,
  strokeWidth,
  error,
  onCrop,
  onDraft,
  onCommitAnnotation,
}: {
  src: string | null;
  base: Dimensions | null;
  crop: Rect | null;
  annotations: Annotation[];
  draft: Annotation | null;
  tool: Tool;
  color: string;
  strokeWidth: number;
  error?: string;
  onCrop: (crop: Rect) => void;
  onDraft: (draft: Annotation | null) => void;
  onCommitAnnotation: (annotation: Annotation) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [fit, setFit] = useState(1);
  const dragRef = useRef<Drag | null>(null);
  const draftRef = useRef<Annotation | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const drawLatest = useEffectEvent((nextImage?: HTMLImageElement | null) => {
    const canvas = canvasRef.current;
    const image = nextImage ?? imageRef.current;
    if (!canvas || !image || !base) return;
    drawEditorCanvas(canvas, image, base, annotations, draft);
  });

  useEffect(() => {
    let cancelled = false;
    imageRef.current = null;
    if (!src) return;
    void loadImage(src)
      .then((img) => {
        if (cancelled) return;
        imageRef.current = img;
        drawLatest(img);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    drawLatest();
  }, [annotations, base, draft]);

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

    if (tool === 'crop') {
      if (crop && !fillsBase(crop, base) && rectContains(crop, point)) {
        dragRef.current = { type: 'move', start: point, startCrop: crop };
      } else {
        dragRef.current = { type: 'draw', start: point };
        onCrop(rectFrom(point, point, base));
      }
    } else {
      dragRef.current = { type: 'annotation', tool, start: point };
      onDraft(annotationFromDrag(tool, point, point, base, color, strokeWidth));
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
    } else if (drag.type === 'move') {
      onCrop(moveCrop(drag.startCrop, drag.start, point, base));
    } else {
      onDraft(
        annotationFromDrag(
          drag.tool,
          drag.start,
          point,
          base,
          color,
          strokeWidth,
          draftRef.current,
        ),
      );
    }
  }

  function endFrameDrag(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.type === 'annotation' && draftRef.current) {
      if (isDrawableAnnotation(draftRef.current)) {
        onCommitAnnotation(draftRef.current);
      } else {
        onDraft(null);
      }
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function onHandleDown(
    e: React.PointerEvent<HTMLSpanElement>,
    handle: Handle,
  ) {
    if (!crop || tool !== 'crop') return;
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
          data-tool={tool}
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
          <canvas
            ref={canvasRef}
            aria-label="Capture annotation canvas"
            className="image-editor-preview"
          />
          {displayCrop ? (
            <div
              className="image-editor-selection"
              data-active={tool === 'crop'}
              style={{
                left: displayCrop.x * fit,
                top: displayCrop.y * fit,
                width: displayCrop.w * fit,
                height: displayCrop.h * fit,
              }}
            >
              {tool === 'crop'
                ? HANDLES.map((h) => (
                    <span
                      key={h}
                      className="image-editor-handle"
                      data-pos={h}
                      onPointerDown={(e) => onHandleDown(e, h)}
                    />
                  ))
                : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
