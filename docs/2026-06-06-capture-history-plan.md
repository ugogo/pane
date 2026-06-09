---
title: Capture History Plan
type: plan
status: proposed
created: 2026-06-06
updated: 2026-06-06
---

# Capture History Plan

## Summary

Add a local capture history so recent screenshots remain available after the
floating preview closes or a new capture replaces the latest capture. History
should support thumbnail browsing, search, copy, save/export, delete, and open
in the editor.

## Goals

- Persist captures locally with metadata and thumbnails.
- Keep the current latest-capture behavior fast.
- Show recent captures on the Capture page.
- Allow users to reopen a history item as the latest capture and edit/copy/save
  it through existing preview/editor flows.
- Bound disk usage with retention settings.

## Non-goals

- Cloud backup or account sync.
- Full asset management with tags and albums in V1.
- OCR search in the first slice.
- Capturing protected/DRM surfaces beyond what current capture already allows.

## Delivery Approach

| Slice | Scope                                                                                               | Validation                                                                   |
| ----- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1     | Add Rust history storage: write PNG and thumbnail on every successful capture, store metadata JSON. | Rust tests for metadata load, retention pruning, and corrupt-entry handling. |
| 2     | Add commands to list, delete, reveal, copy, save-as, and promote a history item to latest.          | Manual smoke from the main Capture page.                                     |
| 3     | Add Capture page history grid/list with search by filename/app/window/date metadata.                | `npm run lint`, `npm run typecheck`, visual QA at default width.             |
| 4     | Add settings for retention count and max disk usage.                                                | Manual pruning smoke and restart persistence.                                |

## Storage Model

Use an app-local directory so captures do not roam:

- `%LocalAppData%/{identifier}/captures/history/`
- `captures.json` metadata index
- `originals/{capture_id}.png`
- `thumbs/{capture_id}.webp` or `{capture_id}.png`

Candidate metadata:

```json
{
  "id": "20260606-184512-8f2a",
  "createdAt": 1780771512000,
  "kind": "fullscreen",
  "width": 2560,
  "height": 1440,
  "originalPath": "originals/20260606-184512-8f2a.png",
  "thumbnailPath": "thumbs/20260606-184512-8f2a.png",
  "bytes": 482918,
  "source": {
    "monitorName": "Primary",
    "windowTitle": null,
    "appName": null
  }
}
```

Use relative paths inside the metadata file so a future storage migration is
less brittle.

## Rust Touchpoints

- Add `apps/windows/tauri/src/commands/capture_history.rs`.
- Extend `commands/capture.rs` and `commands/windows.rs` so successful
  fullscreen and region captures append to history after `make_stored_capture`.
- Add history commands:
  - `list_capture_history(query?: String) -> Vec<CaptureHistoryItem>`
  - `delete_capture_history_item(id: String) -> Vec<CaptureHistoryItem>`
  - `clear_capture_history()`
  - `promote_capture_history_item(id: String) -> CaptureResult`
  - `copy_capture_history_item_to_clipboard(id: String)`
  - `save_capture_history_item_to_desktop(id: String) -> String`
- Keep command access restricted to the main window unless an editor/preview
  window needs a specific command.

## Frontend Touchpoints

- Add wire types and invoke wrappers in `apps/windows/src/lib/commands.ts`.
- Add `captureHistory` to `apps/windows/src/lib/query-keys.ts`.
- Extend `apps/windows/app/(main)/capture.tsx`:
  - search input above history
  - dense thumbnail grid or list
  - actions: open, edit, copy, save, delete
- Reuse existing preview/editor commands after `promote_capture_history_item`.

## UX Notes

- Keep the Capture page operational first: capture buttons and hotkeys stay at
  the top; history is below.
- Use a compact thumbnail grid at wider widths and a list on narrow widths.
- Search should be instant over loaded metadata. The Rust command can return the
  latest N items first; a later slice can paginate.
- Deleting should be reversible only if the app already has a toast/undo pattern
  by then. Otherwise use a confirm step for destructive delete.

## Retention

Defaults:

- keep last 100 captures
- cap history at 500 MB
- never prune the current latest capture while a preview/editor window is using
  it

Pruning order should be oldest first. If file deletion fails, leave metadata
consistent and report the failed path in dev logs.

## Test Plan

- `npm run lint`
- `npm run typecheck`
- `npm run rust:fmt:check`
- `npm run rust:clippy`
- Rust tests:
  - append item
  - list newest first
  - delete item and files
  - prune by count
  - tolerate missing thumbnail/original
- Manual smoke:
  - fullscreen capture appears in history
  - region capture appears in history
  - reopen history item into preview
  - edit history item and confirm resulting latest capture updates
  - copy and save history item
  - restart Pane and confirm history remains

## Risks

- Disk usage can grow quickly with full-resolution PNGs. Retention needs to ship
  with the first persistent slice.
- Editing a history item can be confusing if it mutates the original. V1 should
  promote a copy into latest capture and leave history immutable unless the user
  explicitly saves a new history item.
- Metadata search will be limited until capture records know app/window title.
  Keep OCR and richer source detection as follow-up work.
