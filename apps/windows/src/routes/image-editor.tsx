import { useEffect, useReducer, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createFileRoute } from '@tanstack/react-router';
import {
  ArrowUpRightIcon,
  CheckIcon,
  CropIcon,
  HandIcon,
  HighlighterIcon,
  PenIcon,
  RectangleHorizontalIcon,
  Redo2Icon,
  RotateCcwIcon,
  SaveIcon,
  ScanIcon,
  Undo2Icon,
  XIcon,
} from 'lucide-react';
import {
  commitLatestCaptureEdit,
  hideImageEditor,
  replaceLatestCaptureWithEdit,
  takeLatestCaptureEdit,
} from '@/lib/commands';
import { useEffectEvent } from '@/lib/use-effect-event';
import '@/styles/image-editor.css';

const EDITOR_TOOL_BTN =
  'flex cursor-pointer items-center justify-center border border-border bg-secondary text-muted-foreground transition-[background-color,border-color,color] duration-120 ease-in-out hover:enabled:bg-accent hover:enabled:text-foreground aria-pressed:border-ring aria-pressed:bg-accent aria-pressed:text-foreground disabled:cursor-default disabled:opacity-45';

const WINDOW_ACTION_CONTROL =
  'grid h-9 w-[46px] cursor-pointer place-items-center border-0 bg-transparent p-0 text-[var(--app-foreground-control)] transition-[color,background-color] duration-120 hover:bg-[var(--app-white-09)] hover:text-[var(--app-foreground-control-hover)]';

export const Route = createFileRoute('/image-editor')({
  component: ImageEditorPage,
});

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type SaveState = 'idle' | 'busy' | 'success';
type Tool = 'crop' | 'pan' | 'arrow' | 'rect' | 'highlight' | 'pen';
// Tools that create/edit annotations (everything except crop + the pan/hand tool).
type AnnotationTool = Exclude<Tool, 'crop' | 'pan'>;

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
  startCrop: Rect | null;
  active: boolean;
}

interface ResizeDrag {
  type: 'resize';
  handle: Handle;
  startCrop: Rect;
  snapshot: EditorSnapshot;
  // Whether the resize began from the zoomed crop preview (controls whether the
  // preview is restored when the gesture ends).
  fromPreview: boolean;
}

// Transient gesture entered when the pointer leaves the crop preview: a drag
// turns it into a crop draw on the full capture; a plain click just unzooms.
interface PendingDrawDrag {
  type: 'pending-draw';
  pressPoint: Point;
}

interface MoveDrag {
  type: 'move';
  start: Point;
  startCrop: Rect;
  snapshot: EditorSnapshot;
}

interface AnnotationDrag {
  type: 'annotation';
  tool: AnnotationTool;
  start: Point;
}

interface AnnotationMoveDrag {
  type: 'annotation-move';
  start: Point;
  annotation: Annotation;
  snapshot: EditorSnapshot;
}

interface AnnotationResizeDrag {
  type: 'annotation-resize';
  handle: Handle;
  startBounds: Rect;
  annotation: Annotation;
  snapshot: EditorSnapshot;
}

interface ArrowPointDrag {
  type: 'arrow-point';
  point: 'from' | 'to';
  annotation: Extract<Annotation, { kind: 'arrow' }>;
  snapshot: EditorSnapshot;
}

type Drag =
  | DrawDrag
  | ResizeDrag
  | MoveDrag
  | AnnotationDrag
  | AnnotationMoveDrag
  | AnnotationResizeDrag
  | ArrowPointDrag
  | PendingDrawDrag;

interface EditorSnapshot {
  crop: Rect | null;
  annotations: Annotation[];
}

interface EditorState {
  src: string | null;
  sessionId: number | null;
  base: Dimensions | null;
  crop: Rect | null;
  annotations: Annotation[];
  undo: EditorSnapshot[];
  redo: EditorSnapshot[];
  selectedId: string | null;
  draft: Annotation | null;
  tool: Tool;
  color: string;
  strokeWidth: number;
  // Output background: padding is in image-space px around the crop, background is
  // a gradient id (see GRADIENTS). Non-undoable output settings.
  padding: number;
  background: string | null;
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
  | { type: 'set-padding'; padding: number }
  | { type: 'set-background'; background: string | null }
  | { type: 'commit-crop'; snapshot: EditorSnapshot }
  | { type: 'select-annotation'; id: string | null }
  | { type: 'set-draft'; draft: Annotation | null }
  | { type: 'commit-annotation'; annotation: Annotation }
  | {
      type: 'update-annotation';
      annotation: Annotation;
      commit?: boolean;
      undoSnapshot?: EditorSnapshot;
    }
  | { type: 'delete-selected' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' }
  | { type: 'save-start' }
  | { type: 'save-success' }
  | { type: 'save-error'; error: string };

type Gradient = { id: string; label: string; angle: number; stops: string[] };

// Curated "premium UI" background gradients (the background value is a gradient id).
const GRADIENTS: Gradient[] = [
  { id: 'sunset', label: 'Sunset', angle: 135, stops: ['#ff7e5f', '#feb47b'] },
  { id: 'ocean', label: 'Ocean', angle: 135, stops: ['#2193b0', '#6dd5ed'] },
  { id: 'grape', label: 'Grape', angle: 135, stops: ['#667eea', '#764ba2'] },
  { id: 'peach', label: 'Peach', angle: 135, stops: ['#ffecd2', '#fcb69f'] },
  { id: 'mint', label: 'Mint', angle: 135, stops: ['#1d976c', '#93f9b9'] },
  {
    id: 'midnight',
    label: 'Midnight',
    angle: 135,
    stops: ['#141e30', '#243b55'],
  },
  { id: 'bloom', label: 'Bloom', angle: 135, stops: ['#f093fb', '#f5576c'] },
  { id: 'sky', label: 'Sky', angle: 135, stops: ['#4facfe', '#00f2fe'] },
  { id: 'mango', label: 'Mango', angle: 135, stops: ['#ffe259', '#ffa751'] },
  {
    id: 'graphite',
    label: 'Graphite',
    angle: 135,
    stops: ['#0f2027', '#203a43', '#2c5364'],
  },
];

const DEFAULT_BACKGROUND = GRADIENTS[0].id;

const initialEditorState: EditorState = {
  src: null,
  sessionId: null,
  base: null,
  crop: null,
  annotations: [],
  undo: [],
  redo: [],
  selectedId: null,
  draft: null,
  tool: 'crop',
  color: '#f43f5e',
  strokeWidth: 8,
  padding: 0,
  background: DEFAULT_BACKGROUND,
  save: 'idle',
};

const TOOLS: Array<{
  id: Tool;
  label: string;
  icon: typeof CropIcon;
  code: string; // KeyboardEvent.code for the shortcut
  hint: string; // human-readable key shown in the tooltip
}> = [
  { id: 'crop', label: 'Crop', icon: CropIcon, code: 'KeyC', hint: 'C' },
  {
    id: 'pan',
    label: 'Hand (pan)',
    icon: HandIcon,
    code: 'Space',
    hint: 'Space',
  },
  {
    id: 'arrow',
    label: 'Arrow',
    icon: ArrowUpRightIcon,
    code: 'KeyA',
    hint: 'A',
  },
  {
    id: 'rect',
    label: 'Rectangle',
    icon: RectangleHorizontalIcon,
    code: 'KeyR',
    hint: 'R',
  },
  {
    id: 'highlight',
    label: 'Highlight',
    icon: HighlighterIcon,
    code: 'KeyH',
    hint: 'H',
  },
  { id: 'pen', label: 'Pen', icon: PenIcon, code: 'KeyP', hint: 'P' },
];

const SWATCHES = ['#f43f5e', '#38bdf8', '#facc15', '#22c55e', '#f8fafc'];

function gradientById(id: string | null): Gradient | null {
  return id ? (GRADIENTS.find((g) => g.id === id) ?? null) : null;
}

function gradientCss(gradient: Gradient): string {
  return `linear-gradient(${gradient.angle}deg, ${gradient.stops.join(', ')})`;
}

const MAX_PADDING = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_WHEEL_SENSITIVITY = 0.0015;
const CORNER_RADIUS = 0;
const SHADOW_BLUR = 32;
const SHADOW_OFFSET_Y = 12;
const SHADOW_COLOR = 'rgba(15, 23, 42, 0.35)';
const CROP_DRAG_THRESHOLD = 10;
const STAGE_FIT_PADDING = 40;
const FRAME_AUTOPAN_EDGE = 36;
const FRAME_AUTOPAN_STEP = 9;
const FRAME_AUTOPAN_MIN_STEP = 1.5;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// Compile-time exhaustiveness guard: reaching this with a real value means a
// union member (e.g. a new gesture) was left unhandled.
function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}

function roundRect(rect: Rect): Rect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
  };
}

function sameRect(a: Rect | null, b: Rect | null) {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function snapshotFrom(state: EditorState): EditorSnapshot {
  return { crop: state.crop, annotations: state.annotations };
}

function snapshotFromValues(
  crop: Rect | null,
  annotations: Annotation[],
): EditorSnapshot {
  return { crop, annotations };
}

function baseViewport(base: Dimensions): Rect {
  return { x: 0, y: 0, w: base.width, h: base.height };
}

// Background margin in image-space px (the stored value is already px).
function paddingPx(padding: number): number {
  return padding > 0 ? Math.round(padding) : 0;
}

// Viewport grown by the background margin so `fit` leaves room for the padding.
function paddedFitViewport(viewport: Rect | null, padPx: number): Rect | null {
  if (!viewport || padPx <= 0) return viewport;
  return { x: 0, y: 0, w: viewport.w + padPx * 2, h: viewport.h + padPx * 2 };
}

function rectToViewport(rect: Rect, viewport: Rect): Rect {
  return {
    x: rect.x - viewport.x,
    y: rect.y - viewport.y,
    w: rect.w,
    h: rect.h,
  };
}

function editorViewport(
  base: Dimensions | null,
  crop: Rect | null,
  cropPreview: boolean,
) {
  if (!base) return null;
  if (cropPreview && crop && !fillsBase(crop, base)) return crop;
  return baseViewport(base);
}

function fitViewportToStage(stage: HTMLDivElement, viewport: Rect) {
  const availW = stage.clientWidth - STAGE_FIT_PADDING;
  const availH = stage.clientHeight - STAGE_FIT_PADDING;
  const fit = Math.min(availW / viewport.w, availH / viewport.h, 1);
  return fit > 0 && Number.isFinite(fit) ? fit : 1;
}

// Offset that keeps the crop region in the exact same screen spot when the frame
// switches from the zoomed crop preview (frame == crop) to the full image at the
// same scale. Both frames are stage-centered, so the absolute centering terms
// cancel and only the half-width difference minus the crop origin remains — which
// makes this independent of the cursor, avoiding any click-vs-edge jump.
function frameOffsetForCrop(crop: Rect, base: Dimensions, fit: number): Point {
  return {
    x: ((base.width - crop.w) / 2 - crop.x) * fit,
    y: ((base.height - crop.h) / 2 - crop.y) * fit,
  };
}

function frameAutoPanDelta({
  stage,
  frame,
  clientX,
  clientY,
}: {
  stage: HTMLDivElement;
  frame: HTMLDivElement;
  clientX: number;
  clientY: number;
}): Point | null {
  const stageRect = stage.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const inset = STAGE_FIT_PADDING / 2;
  const left = stageRect.left + inset;
  const top = stageRect.top + inset;
  const right = stageRect.right - inset;
  const bottom = stageRect.bottom - inset;
  let dx = 0;
  let dy = 0;

  if (clientX > right - FRAME_AUTOPAN_EDGE && frameRect.right > right) {
    dx = -Math.min(
      autoPanStep(clientX - (right - FRAME_AUTOPAN_EDGE)),
      frameRect.right - right,
    );
  } else if (clientX < left + FRAME_AUTOPAN_EDGE && frameRect.left < left) {
    dx = Math.min(
      autoPanStep(left + FRAME_AUTOPAN_EDGE - clientX),
      left - frameRect.left,
    );
  }

  if (clientY > bottom - FRAME_AUTOPAN_EDGE && frameRect.bottom > bottom) {
    dy = -Math.min(
      autoPanStep(clientY - (bottom - FRAME_AUTOPAN_EDGE)),
      frameRect.bottom - bottom,
    );
  } else if (clientY < top + FRAME_AUTOPAN_EDGE && frameRect.top < top) {
    dy = Math.min(
      autoPanStep(top + FRAME_AUTOPAN_EDGE - clientY),
      top - frameRect.top,
    );
  }

  return dx || dy ? { x: dx, y: dy } : null;
}

// Ramp the pan speed by how deep the cursor has pushed into the edge zone, so
// the frame eases along for fine crop tweaks near the edge and only accelerates
// when the cursor is shoved all the way out.
function autoPanStep(penetration: number) {
  const ramp = clamp(penetration / FRAME_AUTOPAN_EDGE, 0, 1);
  return (
    FRAME_AUTOPAN_MIN_STEP +
    (FRAME_AUTOPAN_STEP - FRAME_AUTOPAN_MIN_STEP) * ramp
  );
}

function applyFrameAutoPan({
  frameOffset,
  stage,
  frame,
  clientX,
  clientY,
  point,
  fit,
  base,
}: {
  frameOffset: Point | null;
  stage: HTMLDivElement | null;
  frame: HTMLDivElement | null;
  clientX: number;
  clientY: number;
  point: Point;
  fit: number;
  base: Dimensions;
}): { frameOffset: Point | null; point: Point } {
  if (!frameOffset || !stage || !frame) return { frameOffset, point };
  const delta = frameAutoPanDelta({ stage, frame, clientX, clientY });
  if (!delta) return { frameOffset, point };
  return {
    frameOffset: {
      x: frameOffset.x + delta.x,
      y: frameOffset.y + delta.y,
    },
    point: {
      x: clamp(point.x - delta.x / fit, 0, base.width),
      y: clamp(point.y - delta.y / fit, 0, base.height),
    },
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

function inflateRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    w: rect.w + amount * 2,
    h: rect.h + amount * 2,
  };
}

function rectRight(rect: Rect) {
  return rect.x + rect.w;
}

function rectBottom(rect: Rect) {
  return rect.y + rect.h;
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

function pointsBounds(points: Point[]): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    x: left,
    y: top,
    w: Math.max(1, Math.max(...xs) - left),
    h: Math.max(1, Math.max(...ys) - top),
  };
}

function annotationBounds(annotation: Annotation): Rect {
  if (annotation.kind === 'arrow') {
    return pointsBounds([annotation.from, annotation.to]);
  }
  if (annotation.kind === 'pen') {
    return pointsBounds(annotation.points);
  }
  return annotation.rect;
}

function translatePoint(point: Point, dx: number, dy: number): Point {
  return { x: point.x + dx, y: point.y + dy };
}

function moveAnnotation(
  annotation: Annotation,
  start: Point,
  point: Point,
  base: Dimensions,
): Annotation {
  const bounds = annotationBounds(annotation);
  const rawDx = point.x - start.x;
  const rawDy = point.y - start.y;
  const dx = clamp(rawDx, -bounds.x, base.width - rectRight(bounds));
  const dy = clamp(rawDy, -bounds.y, base.height - rectBottom(bounds));

  if (annotation.kind === 'arrow') {
    return {
      ...annotation,
      from: translatePoint(annotation.from, dx, dy),
      to: translatePoint(annotation.to, dx, dy),
    };
  }
  if (annotation.kind === 'pen') {
    return {
      ...annotation,
      points: annotation.points.map((drawPoint) =>
        translatePoint(drawPoint, dx, dy),
      ),
    };
  }
  return {
    ...annotation,
    rect: roundRect({
      ...annotation.rect,
      x: annotation.rect.x + dx,
      y: annotation.rect.y + dy,
    }),
  };
}

function resizeBounds(
  bounds: Rect,
  handle: Handle,
  point: Point,
  base: Dimensions,
) {
  return resizeCrop(bounds, handle, point, base);
}

function scalePoint(point: Point, from: Rect, to: Rect): Point {
  const sx = from.w === 0 ? 0 : (point.x - from.x) / from.w;
  const sy = from.h === 0 ? 0 : (point.y - from.y) / from.h;
  return {
    x: to.x + sx * to.w,
    y: to.y + sy * to.h,
  };
}

function resizeAnnotation(
  annotation: Annotation,
  startBounds: Rect,
  handle: Handle,
  point: Point,
  base: Dimensions,
): Annotation {
  const nextBounds = resizeBounds(startBounds, handle, point, base);
  if (annotation.kind === 'arrow') {
    return {
      ...annotation,
      from: scalePoint(annotation.from, startBounds, nextBounds),
      to: scalePoint(annotation.to, startBounds, nextBounds),
    };
  }
  if (annotation.kind === 'pen') {
    return {
      ...annotation,
      points: annotation.points.map((drawPoint) =>
        scalePoint(drawPoint, startBounds, nextBounds),
      ),
    };
  }
  return {
    ...annotation,
    rect: nextBounds,
  };
}

function moveArrowPoint(
  annotation: Extract<Annotation, { kind: 'arrow' }>,
  pointName: 'from' | 'to',
  point: Point,
  base: Dimensions,
): Annotation {
  return {
    ...annotation,
    [pointName]: {
      x: clamp(point.x, 0, base.width),
      y: clamp(point.y, 0, base.height),
    },
  };
}

function setAnnotationColor(annotation: Annotation, color: string): Annotation {
  return { ...annotation, color };
}

function setAnnotationWidth(annotation: Annotation, width: number): Annotation {
  if (annotation.kind === 'highlight') return annotation;
  return { ...annotation, width };
}

function selectedAnnotationFrom(state: EditorState) {
  return (
    state.annotations.find(
      (annotation) => annotation.id === state.selectedId,
    ) ?? null
  );
}

function hitTestAnnotation(
  annotations: Annotation[],
  point: Point,
  tolerance: number,
) {
  for (let i = annotations.length - 1; i >= 0; i -= 1) {
    const annotation = annotations[i];
    if (
      rectContains(inflateRect(annotationBounds(annotation), tolerance), point)
    ) {
      return annotation;
    }
  }
  return null;
}

function annotationFromDrag(
  tool: AnnotationTool,
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
        undo: [],
        redo: [],
        selectedId: null,
        draft: null,
        error: undefined,
        save: 'idle',
      };
    case 'capture-error':
      return { ...state, error: action.error };
    case 'set-tool':
      return {
        ...state,
        tool: action.tool,
        selectedId: action.tool === 'crop' ? null : state.selectedId,
        draft: null,
      };
    case 'set-color': {
      const selected = selectedAnnotationFrom(state);
      if (!selected) return { ...state, color: action.color };
      // Re-applying the same color is a no-op — don't push a phantom undo step.
      if (selected.color === action.color)
        return { ...state, color: action.color };
      return {
        ...state,
        color: action.color,
        annotations: state.annotations.map((annotation) =>
          annotation.id === selected.id
            ? setAnnotationColor(annotation, action.color)
            : annotation,
        ),
        undo: [...state.undo, snapshotFrom(state)],
        redo: [],
        save: 'idle',
      };
    }
    case 'set-width': {
      const selected = selectedAnnotationFrom(state);
      if (!selected || selected.kind === 'highlight') {
        return { ...state, strokeWidth: action.width };
      }
      // Re-applying the same width is a no-op — don't push a phantom undo step.
      if (selected.width === action.width) {
        return { ...state, strokeWidth: action.width };
      }
      return {
        ...state,
        strokeWidth: action.width,
        annotations: state.annotations.map((annotation) =>
          annotation.id === selected.id
            ? setAnnotationWidth(annotation, action.width)
            : annotation,
        ),
        undo: [...state.undo, snapshotFrom(state)],
        redo: [],
        save: 'idle',
      };
    }
    case 'set-crop':
      return { ...state, crop: action.crop, save: 'idle' };
    case 'set-padding':
      return { ...state, padding: action.padding, save: 'idle' };
    case 'set-background':
      return { ...state, background: action.background, save: 'idle' };
    case 'commit-crop':
      if (sameRect(action.snapshot.crop, state.crop)) return state;
      return {
        ...state,
        undo: [...state.undo, action.snapshot],
        redo: [],
        save: 'idle',
      };
    case 'select-annotation':
      return { ...state, selectedId: action.id, draft: null };
    case 'set-draft':
      return { ...state, draft: action.draft, save: 'idle' };
    case 'commit-annotation':
      return {
        ...state,
        annotations: [...state.annotations, action.annotation],
        undo: [...state.undo, snapshotFrom(state)],
        redo: [],
        selectedId: action.annotation.id,
        draft: null,
        save: 'idle',
      };
    case 'update-annotation':
      return {
        ...state,
        annotations: state.annotations.map((annotation) =>
          annotation.id === action.annotation.id
            ? action.annotation
            : annotation,
        ),
        undo: action.commit
          ? [...state.undo, action.undoSnapshot ?? snapshotFrom(state)]
          : state.undo,
        redo: action.commit ? [] : state.redo,
        selectedId: action.annotation.id,
        save: 'idle',
      };
    case 'delete-selected': {
      if (!state.selectedId) return state;
      const nextAnnotations = state.annotations.filter(
        (annotation) => annotation.id !== state.selectedId,
      );
      if (nextAnnotations.length === state.annotations.length) return state;
      return {
        ...state,
        annotations: nextAnnotations,
        undo: [...state.undo, snapshotFrom(state)],
        redo: [],
        selectedId: null,
        draft: null,
        save: 'idle',
      };
    }
    case 'undo': {
      const previous = state.undo[state.undo.length - 1];
      if (!previous) return state;
      return {
        ...state,
        crop: previous.crop,
        annotations: previous.annotations,
        undo: state.undo.slice(0, -1),
        redo: [snapshotFrom(state), ...state.redo],
        selectedId: null,
        draft: null,
        save: 'idle',
      };
    }
    case 'redo': {
      const [next, ...redo] = state.redo;
      if (!next) return state;
      return {
        ...state,
        crop: next.crop,
        annotations: next.annotations,
        undo: [...state.undo, snapshotFrom(state)],
        redo,
        selectedId: null,
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
            padding: 0,
            background: DEFAULT_BACKGROUND,
            undo: [...state.undo, snapshotFrom(state)],
            redo: [],
            selectedId: null,
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
    const dx = annotation.to.x - annotation.from.x;
    const dy = annotation.to.y - annotation.from.y;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(
      annotation.to.y - annotation.from.y,
      annotation.to.x - annotation.from.x,
    );
    const head = Math.max(18, annotation.width * 4.8);
    if (length > head * 0.9) {
      const shaftLength = length - head * 0.9;
      ctx.beginPath();
      ctx.moveTo(annotation.from.x, annotation.from.y);
      ctx.lineTo(
        annotation.from.x + (dx / length) * shaftLength,
        annotation.from.y + (dy / length) * shaftLength,
      );
      ctx.stroke();
    }

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
  viewport?: Rect,
) {
  const view = viewport ?? { x: 0, y: 0, w: base.width, h: base.height };
  if (canvas.width !== view.w) canvas.width = view.w;
  if (canvas.height !== view.h) canvas.height = view.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, view.w, view.h);
  ctx.drawImage(image, view.x, view.y, view.w, view.h, 0, 0, view.w, view.h);
  ctx.save();
  ctx.translate(-view.x, -view.y);
  annotations.forEach((annotation) => drawAnnotation(ctx, annotation));
  if (draft) drawAnnotation(ctx, draft);
  ctx.restore();
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load capture image.'));
    img.src = src;
  });
}

function canvasGradient(
  ctx: CanvasRenderingContext2D,
  gradient: Gradient,
  w: number,
  h: number,
): CanvasGradient {
  // Convert a CSS linear-gradient angle (0deg = up, clockwise) to a canvas line
  // through the box center spanning the full gradient extent.
  const rad = (gradient.angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = w / 2;
  const cy = h / 2;
  const grad = ctx.createLinearGradient(
    cx - (dx * len) / 2,
    cy - (dy * len) / 2,
    cx + (dx * len) / 2,
    cy + (dy * len) / 2,
  );
  const last = gradient.stops.length - 1;
  gradient.stops.forEach((color, i) => {
    grad.addColorStop(last === 0 ? 0 : i / last, color);
  });
  return grad;
}

async function rasterizeEdit(
  src: string,
  base: Dimensions,
  crop: Rect,
  annotations: Annotation[],
  padding: number,
  background: Gradient | null,
) {
  const image = await loadImage(src);

  // Inner canvas: the cropped image with annotations clipped to the crop.
  const inner = document.createElement('canvas');
  inner.width = crop.w;
  inner.height = crop.h;
  const innerCtx = inner.getContext('2d');
  if (!innerCtx) throw new Error('Unable to prepare edited image.');

  innerCtx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
    0,
    0,
    crop.w,
    crop.h,
  );
  innerCtx.save();
  innerCtx.translate(-crop.x, -crop.y);
  innerCtx.beginPath();
  innerCtx.rect(crop.x, crop.y, crop.w, crop.h);
  innerCtx.clip();
  annotations.forEach((annotation) => drawAnnotation(innerCtx, annotation));
  innerCtx.restore();

  const pad = paddingPx(padding);
  let canvas = inner;
  if (pad > 0) {
    // Outer canvas: background fill + soft shadow + rounded-corner inner image.
    const outer = document.createElement('canvas');
    outer.width = crop.w + pad * 2;
    outer.height = crop.h + pad * 2;
    const ctx = outer.getContext('2d');
    if (!ctx) throw new Error('Unable to prepare edited image.');
    const radius = Math.min(CORNER_RADIUS, crop.w / 2, crop.h / 2);

    if (background) {
      ctx.fillStyle = canvasGradient(
        ctx,
        background,
        outer.width,
        outer.height,
      );
      ctx.fillRect(0, 0, outer.width, outer.height);
    }
    ctx.save();
    ctx.shadowColor = SHADOW_COLOR;
    ctx.shadowBlur = SHADOW_BLUR;
    ctx.shadowOffsetY = SHADOW_OFFSET_Y;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(pad, pad, crop.w, crop.h, radius);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pad, pad, crop.w, crop.h, radius);
    ctx.clip();
    ctx.drawImage(inner, pad, pad);
    ctx.restore();
    canvas = outer;
  }

  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl.startsWith('data:image/png')) {
    throw new Error('Edited image export failed.');
  }
  if (base.width < 1 || base.height < 1) {
    throw new Error('Capture dimensions are invalid.');
  }
  return dataUrl;
}

function ImageEditorPage() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const {
    src,
    sessionId,
    base,
    crop,
    annotations,
    undo,
    redo,
    selectedId,
    draft,
    tool,
    color,
    strokeWidth,
    padding,
    background,
    save,
    error,
  } = state;

  const fetchInFlight = useRef(false);

  function fetchCapture() {
    // One fetch at a time. A new capture-edit session is minted server-side on
    // every call, so overlapping fetches (e.g. StrictMode's double-mounted
    // refresh-capture listener in dev) would each spin up a session and dispatch
    // a redundant capture-loaded; the guard collapses them to one.
    if (fetchInFlight.current) return Promise.resolve();
    fetchInFlight.current = true;
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
      )
      .finally(() => {
        fetchInFlight.current = false;
      });
  }

  const onFetch = useEffectEvent(() => void fetchCapture());
  const onUndo = useEffectEvent(() => dispatch({ type: 'undo' }));
  const onRedo = useEffectEvent(() => dispatch({ type: 'redo' }));
  const onDeleteSelected = useEffectEvent(() =>
    dispatch({ type: 'delete-selected' }),
  );
  const onSetTool = useEffectEvent((tool: Tool) =>
    dispatch({ type: 'set-tool', tool }),
  );

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
      const target = e.target as HTMLElement | null;
      const inField = !!target?.closest(
        'input, textarea, [contenteditable="true"]',
      );
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (inField) return;
        e.preventDefault();
        onDeleteSelected();
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        void hideImageEditor();
        return;
      }
      // Single-key tool shortcuts (c/space/a/r/h/p), unless typing in a field.
      if (!inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const shortcut = TOOLS.find((t) => t.code === e.code);
        if (shortcut) {
          e.preventDefault();
          onSetTool(shortcut.id);
        }
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
      // The background only shows in the padding margin, so a gradient with no
      // padding has no visible effect — a plain crop can still take the fast path.
      const hasBackground = paddingPx(padding) > 0;
      if (annotations.length === 0 && !hasBackground) {
        await commitLatestCaptureEdit(
          sessionId,
          crop.x,
          crop.y,
          crop.w,
          crop.h,
        );
      } else {
        const dataUrl = await rasterizeEdit(
          src,
          base,
          crop,
          annotations,
          padding,
          gradientById(background),
        );
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
    padding === 0 &&
    crop.x === 0 &&
    crop.y === 0 &&
    crop.w === base.width &&
    crop.h === base.height;
  const selectedAnnotation = selectedAnnotationFrom(state);
  const displayColor = selectedAnnotation?.color ?? color;
  const displayStrokeWidth =
    selectedAnnotation && selectedAnnotation.kind !== 'highlight'
      ? selectedAnnotation.width
      : strokeWidth;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-card text-[13px] text-foreground">
      <div
        className="flex h-9 shrink-0 items-center border-b border-border pl-3.5"
        data-tauri-drag-region
        role="presentation"
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement;
          if (target.closest('button')) return;
          void getCurrentWindow().startDragging().catch(console.error);
        }}
      >
        <span className="text-[13px] font-semibold">Edit capture</span>
        <div className="ml-auto flex h-full shrink-0">
          <button
            type="button"
            onClick={() => void hideImageEditor()}
            className={`${WINDOW_ACTION_CONTROL} hover:bg-[var(--app-close-hover)] hover:text-foreground [&_svg]:size-4`}
            aria-label="Close editor"
          >
            <XIcon aria-hidden size={16} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <EditorStage
          key={sessionId ?? 'none'}
          src={src}
          base={base}
          crop={crop}
          annotations={annotations}
          selectedId={selectedId}
          draft={draft}
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          padding={padding}
          background={background}
          error={error}
          onCrop={setCrop}
          onCommitCrop={(snapshot) =>
            dispatch({ type: 'commit-crop', snapshot })
          }
          onDraft={(nextDraft) =>
            dispatch({ type: 'set-draft', draft: nextDraft })
          }
          onSelect={(id) => dispatch({ type: 'select-annotation', id })}
          onCommitAnnotation={(annotation) =>
            dispatch({ type: 'commit-annotation', annotation })
          }
          onUpdateAnnotation={(annotation, commit, undoSnapshot) =>
            dispatch({
              type: 'update-annotation',
              annotation,
              commit,
              undoSnapshot,
            })
          }
        />

        <EditorPanel
          base={base}
          crop={crop}
          tool={tool}
          color={displayColor}
          strokeWidth={displayStrokeWidth}
          strokeDisabled={selectedAnnotation?.kind === 'highlight'}
          padding={padding}
          background={background}
          undo={undo}
          redo={redo}
          save={save}
          unchanged={unchanged}
          onTool={(nextTool) => dispatch({ type: 'set-tool', tool: nextTool })}
          onColor={(nextColor) =>
            dispatch({ type: 'set-color', color: nextColor })
          }
          onWidth={(width) => dispatch({ type: 'set-width', width })}
          onPadding={(next) => dispatch({ type: 'set-padding', padding: next })}
          onBackground={(next) =>
            dispatch({ type: 'set-background', background: next })
          }
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
  strokeDisabled,
  padding,
  background,
  undo,
  redo,
  save,
  unchanged,
  onTool,
  onColor,
  onWidth,
  onPadding,
  onBackground,
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
  strokeDisabled: boolean;
  padding: number;
  background: string | null;
  undo: EditorSnapshot[];
  redo: EditorSnapshot[];
  save: SaveState;
  unchanged: boolean;
  onTool: (tool: Tool) => void;
  onColor: (color: string) => void;
  onWidth: (width: number) => void;
  onPadding: (padding: number) => void;
  onBackground: (background: string | null) => void;
  onCrop: (crop: Rect) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex w-[248px] shrink-0 flex-col gap-3.5 border-l border-border bg-muted p-4">
      <h2 className="pt-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        Tools
      </h2>
      <div className="-mt-1 grid grid-cols-6 gap-1.5">
        {TOOLS.map(({ id, label, icon: Icon, hint }) => (
          <button
            key={id}
            type="button"
            title={`${label} (${hint})`}
            aria-label={label}
            aria-pressed={tool === id}
            onClick={() => onTool(id)}
            className={`${EDITOR_TOOL_BTN} aspect-square w-full rounded-lg`}
          >
            <Icon aria-hidden size={16} />
          </button>
        ))}
      </div>

      <div className="mb-1.5 flex gap-1.5">
        <button
          type="button"
          title="Undo"
          aria-label="Undo"
          onClick={onUndo}
          disabled={undo.length === 0}
          className={`${EDITOR_TOOL_BTN} h-[30px] w-[34px] rounded-lg`}
        >
          <Undo2Icon aria-hidden size={15} />
        </button>
        <button
          type="button"
          title="Redo"
          aria-label="Redo"
          onClick={onRedo}
          disabled={redo.length === 0}
          className={`${EDITOR_TOOL_BTN} h-[30px] w-[34px] rounded-lg`}
        >
          <Redo2Icon aria-hidden size={15} />
        </button>
      </div>

      <h2 className="pt-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        Style
      </h2>
      <div className="-mt-1 flex flex-wrap gap-1.5">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            title={swatch}
            aria-label={`Use ${swatch}`}
            aria-pressed={color === swatch}
            onClick={() => onColor(swatch)}
            className={`${EDITOR_TOOL_BTN} size-7 rounded-full shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--secondary)_52%,transparent)] aria-pressed:border-foreground aria-pressed:shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--secondary)_52%,transparent),0_0_0_2px_var(--ring)]`}
            style={{ background: swatch }}
          />
        ))}
      </div>
      <label className="mb-1.5 grid grid-cols-[auto_minmax(0,1fr)_42px] items-center gap-2 text-[11px] font-semibold text-muted-foreground [&_output]:text-right [&_output]:text-xs [&_output]:text-foreground">
        <span>Stroke</span>
        <input
          type="range"
          min={2}
          max={18}
          step={1}
          value={strokeWidth}
          disabled={strokeDisabled}
          onChange={(e) => onWidth(e.currentTarget.valueAsNumber)}
          className="image-editor-range"
        />
        <output>{strokeWidth}px</output>
      </label>

      <BackgroundControls
        padding={padding}
        background={background}
        onPadding={onPadding}
        onBackground={onBackground}
      />

      <h2 className="pt-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        Crop
      </h2>
      <div className="-mt-1 grid grid-cols-2 gap-x-3 gap-y-2.5">
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

      <div className="flex-1" />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={!base || unchanged}
          className="flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary text-[13px] font-semibold transition-colors duration-120 hover:enabled:bg-accent disabled:cursor-default disabled:opacity-50"
        >
          <RotateCcwIcon aria-hidden size={14} />
          Reset
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={
            !base || !crop || crop.w < 1 || crop.h < 1 || save === 'busy'
          }
          className="flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-transparent bg-primary text-[13px] font-semibold text-primary-foreground transition-colors duration-120 disabled:cursor-default disabled:opacity-50 [&_svg]:text-current [&_svg_*]:stroke-current"
        >
          {save === 'success' ? (
            <CheckIcon aria-hidden size={14} />
          ) : (
            <SaveIcon aria-hidden size={14} />
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

function BackgroundControls({
  padding,
  background,
  onPadding,
  onBackground,
}: {
  padding: number;
  background: string | null;
  onPadding: (padding: number) => void;
  onBackground: (background: string | null) => void;
}) {
  return (
    <>
      <h2 className="pt-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        Background
      </h2>
      <label className="mb-1.5 grid grid-cols-[auto_minmax(0,1fr)_42px] items-center gap-2 text-[11px] font-semibold text-muted-foreground [&_output]:text-right [&_output]:text-xs [&_output]:text-foreground">
        <span>Padding</span>
        <input
          type="range"
          min={0}
          max={MAX_PADDING}
          step={2}
          value={padding}
          onChange={(e) => onPadding(e.currentTarget.valueAsNumber)}
          className="image-editor-range"
        />
        <output>{padding}px</output>
      </label>
      <div className="-mt-1 flex flex-wrap gap-1.5">
        {GRADIENTS.map((gradient) => (
          <button
            key={gradient.id}
            type="button"
            title={gradient.label}
            aria-label={`Use ${gradient.label} gradient`}
            aria-pressed={background === gradient.id}
            onClick={() => onBackground(gradient.id)}
            className={`${EDITOR_TOOL_BTN} size-7 rounded-full shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--secondary)_52%,transparent)] aria-pressed:border-foreground aria-pressed:shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--secondary)_52%,transparent),0_0_0_2px_var(--ring)]`}
            style={{ backgroundImage: gradientCss(gradient) }}
          />
        ))}
      </div>
    </>
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
    <label className="flex min-w-0 flex-col items-stretch gap-1 [&>span]:text-[11px] [&>span]:font-semibold [&>span]:text-muted-foreground">
      <span>{label}</span>
      <div className="flex w-full items-center gap-1 rounded-lg border border-[var(--app-border-strong)] bg-secondary px-2 focus-within:border-ring">
        <input
          type="number"
          min={label === 'X' || label === 'Y' ? 0 : 1}
          value={Number.isFinite(value) ? value : ''}
          disabled={disabled}
          onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
          className="h-[30px] w-full min-w-0 border-0 bg-transparent text-left text-[13px] text-foreground outline-none"
        />
        <span className="text-[11px] text-muted-foreground">px</span>
      </div>
    </label>
  );
}

function finishEditorDrag({
  drag,
  draft,
  crop,
  annotations,
  onCommitAnnotation,
  onDraft,
  onUpdateAnnotation,
  onCommitCrop,
}: {
  drag: Drag;
  draft: Annotation | null;
  crop: Rect | null;
  annotations: Annotation[];
  onCommitAnnotation: (annotation: Annotation) => void;
  onDraft: (draft: Annotation | null) => void;
  onUpdateAnnotation: (
    annotation: Annotation,
    commit?: boolean,
    undoSnapshot?: EditorSnapshot,
  ) => void;
  onCommitCrop: (snapshot: EditorSnapshot) => void;
}) {
  if (drag.type === 'annotation' && draft) {
    if (isDrawableAnnotation(draft)) onCommitAnnotation(draft);
    else onDraft(null);
  } else if (
    drag.type === 'annotation-move' ||
    drag.type === 'annotation-resize' ||
    drag.type === 'arrow-point'
  ) {
    const current = annotations.find(
      (annotation) => annotation.id === drag.annotation.id,
    );
    if (current) onUpdateAnnotation(current, true, drag.snapshot);
  } else if (drag.type === 'draw') {
    if (drag.active && crop) {
      onCommitCrop(
        drag.startCrop
          ? snapshotFromValues(drag.startCrop, annotations)
          : snapshotFromValues(null, annotations),
      );
    }
  } else if (drag.type === 'move' || drag.type === 'resize') {
    onCommitCrop(drag.snapshot);
  }
}

function updateEditorDrag({
  drag,
  point,
  base,
  color,
  strokeWidth,
  draft,
  onCrop,
  onDraft,
  onUpdateAnnotation,
}: {
  drag: Drag;
  point: Point;
  base: Dimensions;
  color: string;
  strokeWidth: number;
  draft: Annotation | null;
  onCrop: (crop: Rect) => void;
  onDraft: (draft: Annotation | null) => void;
  onUpdateAnnotation: (
    annotation: Annotation,
    commit?: boolean,
    undoSnapshot?: EditorSnapshot,
  ) => void;
}) {
  if (drag.type === 'pending-draw') {
    return;
  } else if (drag.type === 'draw') {
    const distance = Math.hypot(point.x - drag.start.x, point.y - drag.start.y);
    if (!drag.active && distance < CROP_DRAG_THRESHOLD) return;
    drag.active = true;
    onCrop(rectFrom(drag.start, point, base));
  } else if (drag.type === 'resize') {
    onCrop(resizeCrop(drag.startCrop, drag.handle, point, base));
  } else if (drag.type === 'move') {
    onCrop(moveCrop(drag.startCrop, drag.start, point, base));
  } else if (drag.type === 'annotation') {
    onDraft(
      annotationFromDrag(
        drag.tool,
        drag.start,
        point,
        base,
        color,
        strokeWidth,
        draft,
      ),
    );
  } else if (drag.type === 'annotation-move') {
    onUpdateAnnotation(
      moveAnnotation(drag.annotation, drag.start, point, base),
    );
  } else if (drag.type === 'annotation-resize') {
    onUpdateAnnotation(
      resizeAnnotation(
        drag.annotation,
        drag.startBounds,
        drag.handle,
        point,
        base,
      ),
    );
  } else if (drag.type === 'arrow-point') {
    onUpdateAnnotation(
      moveArrowPoint(drag.annotation, drag.point, point, base),
    );
  } else {
    assertNever(drag);
  }
}

function startEditorDrag({
  tool,
  crop,
  base,
  point,
  annotations,
  fit,
  color,
  strokeWidth,
}: {
  tool: Exclude<Tool, 'pan'>;
  crop: Rect | null;
  base: Dimensions;
  point: Point;
  annotations: Annotation[];
  fit: number;
  color: string;
  strokeWidth: number;
}): {
  drag: Drag;
  selectedId?: string | null;
  draft?: Annotation | null;
  restoreCropPreview: boolean;
} {
  const hit = hitTestAnnotation(annotations, point, 10 / fit);
  if (hit) {
    return {
      drag: {
        type: 'annotation-move',
        start: point,
        annotation: hit,
        snapshot: snapshotFromValues(crop, annotations),
      },
      selectedId: hit.id,
      restoreCropPreview: tool === 'crop',
    };
  }

  if (tool === 'crop') {
    if (crop && !fillsBase(crop, base) && rectContains(crop, point)) {
      return {
        drag: {
          type: 'move',
          start: point,
          startCrop: crop,
          snapshot: snapshotFromValues(crop, annotations),
        },
        restoreCropPreview: true,
      };
    }
    return {
      drag: { type: 'draw', start: point, startCrop: crop, active: false },
      restoreCropPreview: true,
    };
  }

  return {
    drag: { type: 'annotation', tool, start: point },
    selectedId: null,
    draft: annotationFromDrag(tool, point, point, base, color, strokeWidth),
    restoreCropPreview: false,
  };
}

function startCropHandleDrag({
  crop,
  handle,
  base,
  stage,
  cropPreview,
  fit,
  annotations,
}: {
  crop: Rect;
  handle: Handle;
  base: Dimensions;
  stage: HTMLDivElement | null;
  cropPreview: boolean;
  fit: number;
  annotations: Annotation[];
}): { drag: ResizeDrag; frameOffset: Point | null; frozenFit: number | null } {
  // When the handle is grabbed from the zoomed crop preview, keep the current
  // zoom level (frozenFit) and pan the now-oversized frame so the crop region
  // stays put — instead of snapping back to the full-image scale.
  const pan = cropPreview && !!stage;
  return {
    drag: {
      type: 'resize',
      handle,
      startCrop: crop,
      snapshot: snapshotFromValues(crop, annotations),
      fromPreview: cropPreview,
    },
    frameOffset: pan ? frameOffsetForCrop(crop, base, fit) : null,
    frozenFit: pan ? fit : null,
  };
}

function useViewportFit(
  stageRef: React.RefObject<HTMLDivElement | null>,
  viewport: Rect | null,
) {
  const [fit, setFit] = useState(1);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !viewport) return;
    const compute = () => {
      setFit(fitViewportToStage(stage, viewport));
    };
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- fit is derived from ResizeObserver measurements and the active image viewport
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [stageRef, viewport]);

  return fit;
}

function annotationResizeDrag(
  handle: Handle,
  annotation: Annotation,
  crop: Rect | null,
  annotations: Annotation[],
): AnnotationResizeDrag {
  return {
    type: 'annotation-resize',
    handle,
    startBounds: annotationBounds(annotation),
    annotation,
    snapshot: snapshotFromValues(crop, annotations),
  };
}

function arrowPointDrag(
  pointName: 'from' | 'to',
  annotation: Extract<Annotation, { kind: 'arrow' }>,
  crop: Rect | null,
  annotations: Annotation[],
): ArrowPointDrag {
  return {
    type: 'arrow-point',
    point: pointName,
    annotation,
    snapshot: snapshotFromValues(crop, annotations),
  };
}

type FramePan = {
  handle: Handle;
  startCrop: Rect;
  base: Dimensions;
  fit: number;
};

// Owns the frame translation used while a crop handle is dragged out of the
// zoomed preview: it freezes the zoom level, keeps the crop region in place, and
// runs an auto-pan loop so holding the cursor at a stage edge keeps panning.
function useFramePan(
  stageRef: React.RefObject<HTMLDivElement | null>,
  frameRef: React.RefObject<HTMLDivElement | null>,
  onCrop: (crop: Rect) => void,
) {
  const [frameOffset, setFrameOffset] = useState<Point | null>(null);
  const [frozenFit, setFrozenFit] = useState<number | null>(null);
  const frameOffsetRef = useRef<Point | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const panStateRef = useRef<FramePan | null>(null);
  const onCropRef = useRef(onCrop);
  useEffect(() => {
    onCropRef.current = onCrop;
  });

  function setFrameOffsetValue(next: Point | null) {
    frameOffsetRef.current = next;
    setFrameOffset(next);
  }

  function reset() {
    panStateRef.current = null;
    pointerRef.current = null;
    setFrozenFit(null);
    setFrameOffsetValue(null);
  }

  function begin(
    pan: FramePan,
    offset: Point,
    clientX: number,
    clientY: number,
  ) {
    panStateRef.current = pan;
    pointerRef.current = { x: clientX, y: clientY };
    setFrameOffsetValue(offset);
    setFrozenFit(pan.fit);
  }

  function trackPointer(clientX: number, clientY: number) {
    if (panStateRef.current) pointerRef.current = { x: clientX, y: clientY };
  }

  useEffect(() => {
    if (frozenFit == null) return;
    let raf = 0;
    const tick = () => {
      const pan = panStateRef.current;
      const pointer = pointerRef.current;
      const stage = stageRef.current;
      const frame = frameRef.current;
      if (pan && pointer && stage && frame) {
        const rect = frame.getBoundingClientRect();
        const point = {
          x: clamp((pointer.x - rect.left) / pan.fit, 0, pan.base.width),
          y: clamp((pointer.y - rect.top) / pan.fit, 0, pan.base.height),
        };
        const next = applyFrameAutoPan({
          frameOffset: frameOffsetRef.current,
          stage,
          frame,
          clientX: pointer.x,
          clientY: pointer.y,
          point,
          fit: pan.fit,
          base: pan.base,
        });
        if (next.frameOffset !== frameOffsetRef.current) {
          setFrameOffsetValue(next.frameOffset);
          onCropRef.current(
            resizeCrop(pan.startCrop, pan.handle, next.point, pan.base),
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frozenFit, stageRef, frameRef]);

  return { frameOffset, frozenFit, reset, begin, trackPointer };
}

// Loads the source image and keeps the preview canvas redrawn as the image,
// annotations, draft, or viewport change.
function useCanvasPreview({
  canvasRef,
  src,
  base,
  annotations,
  draft,
  viewport,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  src: string | null;
  base: Dimensions | null;
  annotations: Annotation[];
  draft: Annotation | null;
  viewport: Rect | null;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  // Value key so the canvas redraws on any viewport change (crop, preview toggle,
  // or the in-preview draw freeze/unfreeze) without churning on object identity.
  const viewportKey = viewport
    ? `${viewport.x}:${viewport.y}:${viewport.w}:${viewport.h}`
    : 'none';

  const drawLatest = useEffectEvent((nextImage?: HTMLImageElement | null) => {
    const canvas = canvasRef.current;
    const image = nextImage ?? imageRef.current;
    if (!canvas || !image || !base) return;
    drawEditorCanvas(
      canvas,
      image,
      base,
      annotations,
      draft,
      viewport ?? undefined,
    );
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
  }, [annotations, base, draft, viewportKey]);
}

// Keeps the zoomed/panned content from being dragged entirely off the stage.
function clampPan(pan: Point, zoom: number, stage: HTMLDivElement): Point {
  const maxX = (stage.clientWidth * (zoom - 1)) / 2 + STAGE_FIT_PADDING;
  const maxY = (stage.clientHeight * (zoom - 1)) / 2 + STAGE_FIT_PADDING;
  return { x: clamp(pan.x, -maxX, maxX), y: clamp(pan.y, -maxY, maxY) };
}

// Manual zoom (1×–MAX_ZOOM) + pan as an outer transform on the canvas wrapper,
// for inspecting/editing detail. Deliberately separate from `fit` so the crop and
// frozen-pan math stay untouched; pointer math derives its scale from the rect.
function useZoomPan(
  stageRef: RefObject<HTMLDivElement | null>,
  wrapperRef: RefObject<HTMLDivElement | null>,
) {
  const [view, setView] = useState<{ zoom: number; pan: Point }>({
    zoom: 1,
    pan: { x: 0, y: 0 },
  });
  // Mirrors `view` for synchronous reads from the (effect-bound) wheel handler and
  // rapid pointer events; only ever written from event handlers, never in render.
  const viewRef = useRef(view);

  function apply(zoom: number, pan: Point) {
    const stage = stageRef.current;
    const next = {
      zoom,
      pan:
        zoom <= 1 ? { x: 0, y: 0 } : stage ? clampPan(pan, zoom, stage) : pan,
    };
    viewRef.current = next;
    setView(next);
  }

  function reset() {
    apply(1, { x: 0, y: 0 });
  }

  function panBy(dx: number, dy: number) {
    const { zoom, pan } = viewRef.current;
    apply(zoom, { x: pan.x + dx, y: pan.y + dy });
  }

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onWheel(e: WheelEvent) {
      const { zoom, pan } = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        e.preventDefault();
        const next = clamp(
          zoom * Math.exp(-e.deltaY * ZOOM_WHEEL_SENSITIVITY),
          MIN_ZOOM,
          MAX_ZOOM,
        );
        if (next === zoom) return;
        // Keep the point under the cursor fixed (transform-origin is top-left).
        const rect = wrapper.getBoundingClientRect();
        const k = 1 - next / zoom;
        apply(next, {
          x: pan.x + (e.clientX - rect.left) * k,
          y: pan.y + (e.clientY - rect.top) * k,
        });
      } else if (zoom > 1) {
        e.preventDefault();
        apply(zoom, { x: pan.x - e.deltaX, y: pan.y - e.deltaY });
      }
    }
    // eslint-disable-next-line react-doctor/client-passive-event-listeners -- the handler calls preventDefault to own zoom/pan
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-doctor/exhaustive-deps -- handler reads viewRef + stable setters
  }, [stageRef, wrapperRef]);

  return { zoom: view.zoom, pan: view.pan, reset, panBy };
}

type EditorStageProps = {
  src: string | null;
  base: Dimensions | null;
  crop: Rect | null;
  annotations: Annotation[];
  selectedId: string | null;
  draft: Annotation | null;
  tool: Tool;
  color: string;
  strokeWidth: number;
  padding: number;
  background: string | null;
  error?: string;
  onCrop: (crop: Rect) => void;
  onCommitCrop: (snapshot: EditorSnapshot) => void;
  onDraft: (draft: Annotation | null) => void;
  onSelect: (id: string | null) => void;
  onCommitAnnotation: (annotation: Annotation) => void;
  onUpdateAnnotation: (
    annotation: Annotation,
    commit?: boolean,
    undoSnapshot?: EditorSnapshot,
  ) => void;
};

// Interaction host: owns the pointer gesture wiring and stitches together the
// extracted concerns (useFramePan, useCanvasPreview, useZoomPan, geometry
// helpers). It's intentionally a bit long; the pure/mechanism logic already lives
// outside it. A focused follow-up could lift the gesture handlers into a hook.
// eslint-disable-next-line react-doctor/no-giant-component -- see note above
function EditorStage({
  src,
  base,
  crop,
  annotations,
  selectedId,
  draft,
  tool,
  color,
  strokeWidth,
  padding,
  background,
  error,
  onCrop,
  onCommitCrop,
  onDraft,
  onSelect,
  onCommitAnnotation,
  onUpdateAnnotation,
}: EditorStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [grabCursor, setGrabCursor] = useState(false);
  const [cropPreview, setCropPreview] = useState(false);
  // While drawing a new crop from the zoomed preview, the viewport is pinned to
  // the crop that was showing so the view doesn't zoom out (or chase the live
  // crop) mid-draw. Null at all other times.
  const [viewportFreeze, setViewportFreeze] = useState<Rect | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const draftRef = useRef<Annotation | null>(null);
  const panDragRef = useRef<{ x: number; y: number } | null>(null);
  const {
    frameOffset,
    frozenFit,
    reset: resetFramePan,
    begin: beginFramePan,
    trackPointer,
  } = useFramePan(stageRef, frameRef, onCrop);
  const {
    zoom,
    pan,
    reset: resetZoom,
    panBy,
  } = useZoomPan(stageRef, wrapperRef);

  const canToggleCropPreview = !!base && !!crop && !fillsBase(crop, base);
  const effectiveCropPreview = cropPreview && canToggleCropPreview;
  const viewport =
    viewportFreeze ?? editorViewport(base, crop, effectiveCropPreview);
  // Background margin (image px); fit shrinks so the padded content fits.
  const padPx = paddingPx(padding);
  const fitVp = paddedFitViewport(viewport, padPx);
  const measuredFit = useViewportFit(stageRef, fitVp);
  const fit = frozenFit ?? measuredFit;
  const gradient = gradientById(background);
  const backgroundCss = gradient ? gradientCss(gradient) : null;

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useCanvasPreview({
    canvasRef,
    src,
    base,
    annotations,
    draft,
    viewport,
  });

  // On-screen px per image px, read from the rendered rect so it accounts for the
  // zoom transform automatically (equals `fit` when zoom is 1).
  const pointerScale = fit * zoom;

  function pointFromEvent(e: React.PointerEvent) {
    const frame = frameRef.current;
    if (!frame || !base || !viewport) return null;
    const rect = frame.getBoundingClientRect();
    const scale = rect.width / viewport.w;
    if (!(scale > 0)) return null;
    return {
      x: clamp(viewport.x + (e.clientX - rect.left) / scale, 0, base.width),
      y: clamp(viewport.y + (e.clientY - rect.top) / scale, 0, base.height),
    };
  }

  function onFrameDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!base) return;
    if (tool === 'pan') {
      // Hand tool: drag pans the zoomed view instead of editing.
      panDragRef.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const point = pointFromEvent(e);
    if (!point) return;
    e.preventDefault();

    if (effectiveCropPreview && tool === 'crop') {
      const hit = hitTestAnnotation(annotations, point, 10 / pointerScale);
      if (!hit) {
        // Defer: a drag draws a new crop within the current view (no zoom-out,
        // anchored at this point); a plain click leaves the preview.
        dragRef.current = { type: 'pending-draw', pressPoint: point };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      onSelect(hit.id);
      dragRef.current = {
        type: 'annotation-move',
        start: point,
        annotation: hit,
        snapshot: snapshotFromValues(crop, annotations),
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const next = startEditorDrag({
      tool,
      crop,
      base,
      point,
      annotations,
      fit,
      color,
      strokeWidth,
    });
    if (next.restoreCropPreview) {
      setCropPreview(false);
      resetFramePan();
    }
    if (next.selectedId !== undefined) onSelect(next.selectedId);
    if (next.draft !== undefined) onDraft(next.draft);
    dragRef.current = next.drag;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onFrameMove(e: React.PointerEvent<HTMLDivElement>) {
    if (panDragRef.current) {
      const last = panDragRef.current;
      panBy(e.clientX - last.x, e.clientY - last.y);
      panDragRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    let drag = dragRef.current;
    const point = pointFromEvent(e);
    if (!point) return;
    // First move: turn the deferred gesture into a crop draw anchored at the
    // press point. If it began in the preview, pin the viewport to the current
    // crop so the view stays put (no zoom-out) while the new crop is drawn.
    if (drag?.type === 'pending-draw') {
      if (effectiveCropPreview && crop) setViewportFreeze(crop);
      drag = {
        type: 'draw',
        start: drag.pressPoint,
        startCrop: crop,
        active: false,
      };
      dragRef.current = drag;
    }
    if (!drag) {
      setGrabCursor(!!hitTestAnnotation(annotations, point, 10 / pointerScale));
      return;
    }
    if (!base) return;
    // While zoom is frozen for a handle drag, the auto-pan loop owns edge
    // panning; the move handler only records the latest cursor position.
    trackPointer(e.clientX, e.clientY);
    updateEditorDrag({
      drag,
      point,
      base,
      color,
      strokeWidth,
      draft: draftRef.current,
      onCrop,
      onDraft,
      onUpdateAnnotation,
    });
  }

  function endFrameDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (panDragRef.current) {
      panDragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    // End any in-preview crop draw: unpin the viewport so it re-centers on the
    // committed crop below.
    if (viewportFreeze) setViewportFreeze(null);
    if (drag?.type === 'pending-draw') {
      // A click that never became a drag: leave the zoomed preview.
      setCropPreview(false);
    } else if (drag) {
      finishEditorDrag({
        drag,
        draft: draftRef.current,
        crop,
        annotations,
        onCommitAnnotation,
        onDraft,
        onUpdateAnnotation,
        onCommitCrop,
      });
      if (
        (drag.type === 'draw' && drag.active) ||
        drag.type === 'move' ||
        drag.type === 'resize'
      ) {
        // A handle resize started from the full view shouldn't yank the user into
        // the zoomed preview; drawing/moving a crop still shows the result there.
        const keepPreview = drag.type !== 'resize' || drag.fromPreview;
        resetFramePan();
        if (keepPreview) {
          resetZoom();
          setCropPreview(true);
        }
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
    if (!crop || !base || tool !== 'crop') return;
    e.preventDefault();
    e.stopPropagation();
    // Frozen-pan resize relies on a 1:1 outer transform, so drop any manual zoom.
    resetZoom();
    const next = startCropHandleDrag({
      crop,
      handle,
      base,
      stage: stageRef.current,
      cropPreview: effectiveCropPreview,
      fit,
      annotations,
    });
    if (next.frozenFit != null && next.frameOffset) {
      beginFramePan(
        { handle, startCrop: crop, base, fit: next.frozenFit },
        next.frameOffset,
        e.clientX,
        e.clientY,
      );
    } else {
      resetFramePan();
    }
    setCropPreview(false);
    dragRef.current = next.drag;
    frameRef.current?.setPointerCapture(e.pointerId);
  }

  function onAnnotationHandleDown(
    e: React.PointerEvent<HTMLSpanElement>,
    handle: Handle,
    annotation: Annotation,
  ) {
    if (!base) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(annotation.id);
    dragRef.current = annotationResizeDrag(
      handle,
      annotation,
      crop,
      annotations,
    );
    frameRef.current?.setPointerCapture(e.pointerId);
  }

  function onArrowPointDown(
    e: React.PointerEvent<HTMLSpanElement>,
    pointName: 'from' | 'to',
    annotation: Extract<Annotation, { kind: 'arrow' }>,
  ) {
    e.preventDefault();
    e.stopPropagation();
    onSelect(annotation.id);
    dragRef.current = arrowPointDrag(pointName, annotation, crop, annotations);
    frameRef.current?.setPointerCapture(e.pointerId);
  }

  const displayCrop = crop && crop.w > 0 && crop.h > 0 ? crop : null;
  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedId) ?? null;
  const selectedBounds = selectedAnnotation
    ? annotationBounds(selectedAnnotation)
    : null;

  return (
    <EditorStageView
      src={src}
      tool={tool}
      fit={fit}
      viewport={viewport}
      frameOffset={frameOffset}
      panning={frozenFit != null}
      background={backgroundCss}
      framePadding={padPx * fit}
      cornerRadius={CORNER_RADIUS * fit}
      cropPreview={effectiveCropPreview && viewportFreeze === null}
      grabCursor={grabCursor}
      zoom={zoom}
      pan={pan}
      error={error}
      stageRef={stageRef}
      wrapperRef={wrapperRef}
      frameRef={frameRef}
      canvasRef={canvasRef}
      displayCrop={displayCrop}
      selectedAnnotation={selectedAnnotation}
      selectedBounds={selectedBounds}
      onFrameDown={onFrameDown}
      onFrameMove={onFrameMove}
      onFrameEnd={endFrameDrag}
      onFrameLeave={() => setGrabCursor(false)}
      onFitZoom={resetZoom}
      onCropHandle={onHandleDown}
      onAnnotationHandle={onAnnotationHandleDown}
      onArrowPoint={onArrowPointDown}
    />
  );
}

function EditorStageView({
  src,
  tool,
  fit,
  viewport,
  frameOffset,
  panning,
  background,
  framePadding,
  cornerRadius,
  cropPreview,
  grabCursor,
  zoom,
  pan,
  error,
  stageRef,
  wrapperRef,
  frameRef,
  canvasRef,
  displayCrop,
  selectedAnnotation,
  selectedBounds,
  onFrameDown,
  onFrameMove,
  onFrameEnd,
  onFrameLeave,
  onFitZoom,
  onCropHandle,
  onAnnotationHandle,
  onArrowPoint,
}: {
  src: string | null;
  tool: Tool;
  fit: number;
  viewport: Rect | null;
  frameOffset: Point | null;
  panning: boolean;
  background: string | null;
  framePadding: number;
  cornerRadius: number;
  cropPreview: boolean;
  grabCursor: boolean;
  zoom: number;
  pan: Point;
  error?: string;
  stageRef: React.RefObject<HTMLDivElement | null>;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  frameRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  displayCrop: Rect | null;
  selectedAnnotation: Annotation | null;
  selectedBounds: Rect | null;
  onFrameDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onFrameMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onFrameEnd: (e: React.PointerEvent<HTMLDivElement>) => void;
  onFrameLeave: () => void;
  onFitZoom: () => void;
  onCropHandle: (
    e: React.PointerEvent<HTMLSpanElement>,
    handle: Handle,
  ) => void;
  onAnnotationHandle: (
    e: React.PointerEvent<HTMLSpanElement>,
    handle: Handle,
    annotation: Annotation,
  ) => void;
  onArrowPoint: (
    e: React.PointerEvent<HTMLSpanElement>,
    pointName: 'from' | 'to',
    annotation: Extract<Annotation, { kind: 'arrow' }>,
  ) => void;
}) {
  return (
    <div
      className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-secondary p-5"
      ref={stageRef}
    >
      {error ? (
        <p className="text-center text-xs text-destructive">{error}</p>
      ) : null}
      {src ? (
        <div
          ref={wrapperRef}
          className="relative max-h-full max-w-full shrink-0"
          style={{
            padding: framePadding,
            background: background ?? undefined,
            maxWidth: panning ? 'none' : undefined,
            maxHeight: panning ? 'none' : undefined,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <div
            ref={frameRef}
            className="image-editor-frame"
            data-tool={tool}
            data-grabbable={grabCursor}
            data-grab={tool === 'pan'}
            style={
              viewport
                ? {
                    width: viewport.w * fit,
                    height: viewport.h * fit,
                    transform: frameOffset
                      ? `translate(${frameOffset.x}px, ${frameOffset.y}px)`
                      : undefined,
                    maxWidth: panning ? 'none' : undefined,
                    maxHeight: panning ? 'none' : undefined,
                    borderRadius: cornerRadius,
                    boxShadow: `0 ${SHADOW_OFFSET_Y * fit}px ${
                      SHADOW_BLUR * fit
                    }px ${SHADOW_COLOR}`,
                  }
                : undefined
            }
            onPointerDown={onFrameDown}
            onPointerMove={onFrameMove}
            onPointerUp={onFrameEnd}
            onPointerCancel={onFrameEnd}
            onPointerLeave={onFrameLeave}
          >
            <canvas
              ref={canvasRef}
              aria-label="Capture annotation canvas"
              className="block h-full w-full object-fill pointer-events-none"
            />
            {displayCrop ? (
              <CropSelectionOverlay
                crop={displayCrop}
                viewport={viewport}
                fit={fit}
                active={tool === 'crop'}
                preview={cropPreview}
                onHandle={onCropHandle}
              />
            ) : null}
            {selectedAnnotation && selectedBounds ? (
              <ObjectSelectionOverlay
                annotation={selectedAnnotation}
                bounds={selectedBounds}
                viewport={viewport}
                fit={fit}
                onHandle={onAnnotationHandle}
                onArrowPoint={onArrowPoint}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {src && zoom !== 1 ? (
        <div className="absolute right-3 top-3 z-[6] flex gap-1.5">
          <button
            type="button"
            className="flex h-[30px] cursor-pointer items-center gap-[5px] rounded-lg border border-border bg-[color-mix(in_srgb,var(--muted)_88%,transparent)] px-[9px] text-[11px] font-semibold tabular-nums text-foreground shadow-[0_8px_22px_var(--app-shadow-strong)] transition-[background-color,border-color] duration-120 hover:border-[var(--app-border-strong)] hover:bg-accent aria-pressed:border-ring aria-pressed:text-primary"
            title="Fit to window"
            aria-label="Fit to window"
            onClick={onFitZoom}
          >
            <ScanIcon aria-hidden size={15} />
            <span>{Math.round(zoom * 100)}%</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CropSelectionOverlay({
  crop,
  viewport,
  fit,
  active,
  preview,
  onHandle,
}: {
  crop: Rect;
  viewport: Rect | null;
  fit: number;
  active: boolean;
  preview: boolean;
  onHandle: (e: React.PointerEvent<HTMLSpanElement>, handle: Handle) => void;
}) {
  const displayCrop = viewport ? rectToViewport(crop, viewport) : crop;
  // Handles show whenever the crop tool is selected (active); other tools get a
  // clean, handle-free preview.
  const showHandles = active;
  return (
    <div
      className="image-editor-selection"
      data-active={active}
      data-preview={preview}
      style={{
        left: displayCrop.x * fit,
        top: displayCrop.y * fit,
        width: displayCrop.w * fit,
        height: displayCrop.h * fit,
      }}
    >
      {showHandles
        ? HANDLES.map((h) => (
            <span
              key={h}
              className="image-editor-handle"
              data-pos={h}
              onPointerDown={(e) => onHandle(e, h)}
            />
          ))
        : null}
    </div>
  );
}

function ObjectSelectionOverlay({
  annotation,
  bounds,
  viewport,
  fit,
  onHandle,
  onArrowPoint,
}: {
  annotation: Annotation;
  bounds: Rect;
  viewport: Rect | null;
  fit: number;
  onHandle: (
    e: React.PointerEvent<HTMLSpanElement>,
    handle: Handle,
    annotation: Annotation,
  ) => void;
  onArrowPoint: (
    e: React.PointerEvent<HTMLSpanElement>,
    pointName: 'from' | 'to',
    annotation: Extract<Annotation, { kind: 'arrow' }>,
  ) => void;
}) {
  const displayBounds = viewport ? rectToViewport(bounds, viewport) : bounds;
  if (annotation.kind === 'arrow') {
    return (
      <>
        <span
          className="image-editor-arrow-point"
          data-point="from"
          style={{
            left: (annotation.from.x - (viewport?.x ?? 0)) * fit,
            top: (annotation.from.y - (viewport?.y ?? 0)) * fit,
          }}
          onPointerDown={(e) => onArrowPoint(e, 'from', annotation)}
        />
        <span
          className="image-editor-arrow-point"
          data-point="to"
          style={{
            left: (annotation.to.x - (viewport?.x ?? 0)) * fit,
            top: (annotation.to.y - (viewport?.y ?? 0)) * fit,
          }}
          onPointerDown={(e) => onArrowPoint(e, 'to', annotation)}
        />
      </>
    );
  }

  return (
    <div
      className="image-editor-object-selection"
      style={{
        left: displayBounds.x * fit,
        top: displayBounds.y * fit,
        width: displayBounds.w * fit,
        height: displayBounds.h * fit,
      }}
    >
      {HANDLES.map((h) => (
        <span
          key={h}
          className="image-editor-object-handle"
          data-pos={h}
          onPointerDown={(e) => onHandle(e, h, annotation)}
        />
      ))}
    </div>
  );
}
