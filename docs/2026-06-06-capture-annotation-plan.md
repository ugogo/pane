---
title: Capture Annotation Plan
type: plan
status: in-progress
created: 2026-06-06
updated: 2026-06-28
---

# Capture Annotation Plan

## Summary

Expand the existing capture editor from crop-only editing into a lightweight
annotation surface. V1 should cover the everyday CleanShot-style tools: arrow,
rectangle, highlighter, text, blur/pixelate, undo/redo, save, and copy.

The editor should stay inside the existing `image-editor` child window and keep
the Rust side responsible for storing the latest committed capture.

## Current Status

The editor has moved beyond crop-only editing. Crop, arrow, rectangle,
highlighter, pen, undo/redo, color/stroke controls, keyboard shortcuts, and
commit back into the latest-capture flow are implemented in the Windows
`image-editor` route.

Still remaining from the original V1 target:

- Text labels.
- Blur/pixelate rectangles.
- Clear-all.
- Focused reducer/unit coverage for editor operations.

## Goals

- Annotate the latest capture without leaving Pane.
- Keep editing responsive for full-resolution screenshots.
- Commit the annotated image back into the existing latest-capture flow so the
  floating preview, save, copy, and zoom windows all see the updated result.
- Preserve the current crop capability as one tool in the editor.
- Keep annotation state local to the editor session until the user commits.

## Non-goals

- Multi-image project files.
- Layer persistence after the editor closes.
- OCR or smart object detection.
- Full design-tool controls such as arbitrary bezier paths.

## Delivery Approach

| Slice | Scope                                                                                             | Status  |
| ----- | ------------------------------------------------------------------------------------------------- | ------- |
| 1     | Refactor `image-editor.tsx` state so crop becomes a tool mode rather than the whole editor model. | Shipped |
| 2     | Add canvas-based rendering with arrow, rectangle, highlighter, and freehand pen.                  | Shipped |
| 3     | Add text labels, blur/pixelate rectangles, undo/redo, and clear-all.                              | Partial |
| 4     | Add polish: tool settings, keyboard shortcuts, cursor states, and accessibility labels.           | Partial |

## Architecture

Use a browser canvas for the editor workspace:

- Load source capture through `takeLatestCaptureEdit`.
- Keep an immutable source bitmap plus a serializable list of annotation
  operations in React state.
- Render the live preview to a visible canvas.
- On commit, rasterize source plus crop plus annotations into a PNG data URL and
  call `replaceLatestCaptureWithEdit(dataUrl)` or an annotation-specific commit
  command.

This keeps Rust image manipulation small for V1. Rust already accepts edited
PNG/JPEG data URLs through `replace_latest_capture_with_edit` and
`save_edited_capture_to_desktop`.

## Annotation Model

Candidate TypeScript operation shape:

```ts
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
  | {
      id: string;
      kind: 'text';
      at: Point;
      text: string;
      color: string;
      size: number;
    }
  | {
      id: string;
      kind: 'blur';
      rect: Rect;
      mode: 'blur' | 'pixelate';
      strength: number;
    }
  | { id: string; kind: 'pen'; points: Point[]; color: string; width: number };
```

Keep undo/redo as two stacks of editor states or operation patches. Avoid manual
`useMemo` and `useCallback`; the React Compiler handles memoization.

## Frontend Touchpoints

- `apps/windows/src/routes/image-editor.tsx`
  - Split into smaller local components once tool modes grow.
  - Keep editor-specific CSS in `apps/windows/src/styles/shell.css` unless
    moving editor styles into a dedicated imported CSS file becomes clearer.
- `apps/windows/src/routes/preview.tsx`
  - Keep the existing Edit button entry point.
  - Optionally add direct Copy after edit if annotation commit exposes a path.
- `apps/windows/src/lib/commands.ts`
  - Reuse `replaceLatestCaptureWithEdit`.
  - Add a `copyEditedCaptureToClipboard(dataUrl)` command only if browser-side
    clipboard image writes are unreliable in WebView2.
- `lucide-react`
  - Use Windows lucide imports with the `Icon` suffix.

## Rust Touchpoints

V1 can avoid new Rust image composition if the frontend produces the final data
URL. Rust changes may still be needed for:

- `copy_edited_capture_to_clipboard(data_url)` if the editor needs direct copy.
- Raising command permissions for `image-editor` in
  `apps/windows/tauri/capabilities/image-editor.json`.
- Optional size limits on edited data URLs before decode.

Any new command callable from `image-editor` should use `require_window` and
only allow the `image-editor` window unless the main window also needs it.

## UX Notes

- Use icon buttons with tooltips for tools: crop, arrow, rectangle, highlight,
  text, blur, pen, undo, redo, reset, save, copy.
- Keep the primary canvas unframed and maximized inside the editor body.
- Put tool settings in a compact side panel: color swatch, stroke width, blur
  strength, text size.
- Text must remain legible at the default editor size; avoid oversized labels in
  the compact panel.
- Escape should continue closing the editor only when not actively editing text.

## Test Plan

- `npm run lint`
- `npm run typecheck`
- Manual smoke:
  - crop only, save
  - draw arrow and rectangle, save
  - add text, save
  - blur a rectangle, save
  - undo/redo each tool
  - copy and save from the preview after committing
  - verify floating preview refreshes after commit
- Visual QA:
  - default editor window
  - narrow 800-900 px main window flow into editor
  - high-DPI screenshot source

## Risks

- Canvas coordinate transforms can drift when the image is fitted to the editor.
  Keep all annotation coordinates in source-image pixels and derive screen
  coordinates from the current fit.
- Large screenshots can make repeated full-canvas rasterization expensive.
  Re-render on animation frames during drag and rasterize the final PNG only on
  commit.
- Text editing inside canvas is awkward. Use a positioned DOM input for active
  text edit and commit it into the annotation model.
