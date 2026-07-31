---
title: Tray Menu Expansion Plan
type: plan
status: proposed
created: 2026-06-06
updated: 2026-06-06
---

# Tray Menu Expansion Plan

## Summary

Expand Pane's Windows tray menu from Show/Quit into a useful quick-action
surface for capture, lighting, display presets, companion status, and app
visibility.

The first version should use Tauri's native tray/menu APIs already enabled in
`apps/windows/tauri/src/tray.rs`. Rich controls such as sliders can come later
through a custom popup window if the native menu becomes too limited.

## Goals

- Keep Pane useful while the main window is hidden.
- Add quick capture actions from the tray.
- Show common display/light preset actions when available.
- Provide reliable show/hide and quit behavior.
- Avoid exposing high-risk commands from child windows or unauthenticated local
  surfaces.

## Non-goals

- A custom always-on-top mini dashboard in V1.
- Tray search.
- Editing hotkeys from the tray.
- Phone companion pairing QR from the tray, unless a later custom popup exists.

## Current State

`apps/windows/tauri/src/tray.rs` creates:

- Show Pane
- Quit
- Left-click shows the main window
- Right-click opens the native menu

Tauri is already compiled with `tray-icon`.

## Delivery Approach

| Slice | Scope                                                                                        | Validation                                                      |
| ----- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1     | Add static quick actions: Show/Hide, Capture full screen, Select area, Toggle preview, Quit. | Manual tray smoke while main window is visible and hidden.      |
| 2     | Add dynamic display preset submenu from `monitor-presets.json`.                              | Manual preset apply from tray and missing-file fallback.        |
| 3     | Add dynamic light preset submenu after light presets ship.                                   | Manual partial failure logging and no-connected-light behavior. |
| 4     | Add companion/status items and optional settings entry points.                               | Manual navigation/show main window to target route.             |

## Menu Structure

Candidate V1:

- Show Pane / Hide Pane
- Capture
  - Full screen
  - Select area
  - Toggle floating preview
- Display Presets
  - Night
  - Work
  - Presentation
- Light Presets
  - Night
  - Movie
  - Off
- Companion
  - Show Companion
  - Pair iPhone (opens main window on Companion page)
- Diagnostics
- Quit

Keep unavailable dynamic sections hidden or disabled. Native tray menus should
not display stale preset names after save/delete.

## Rust Touchpoints

- Expand `apps/windows/tauri/src/tray.rs`.
- Reuse existing Rust service functions rather than invoking frontend code:
  - `commands/capture::perform_fullscreen_capture`
  - `commands/windows::show_capture_preview`
  - `commands/windows::show_area_selector`
  - `commands/brightness::apply_preset_at` or existing preset apply helpers
  - future `commands/light_presets::apply_preset_at`
- Add a route-aware helper to show the main window and optionally navigate.
  Navigation can be an emitted frontend event such as `navigate-main`.
- Add tray refresh hooks after preset save/delete commands.

## Frontend Touchpoints

- Listen for a `navigate-main` event in `apps/windows/app/(main)/_layout.tsx`
  if Rust needs to route the main window to `/capture`, `/display`, etc.
- After adding light presets, trigger tray menu refresh when the preset list
  changes.
- Add command wrappers only if the frontend needs to request menu refresh.

## Menu Refresh Strategy

Native menus are simplest if rebuilt when data changes:

- Build static menu at startup.
- On display preset save/delete, call `tray::refresh(app)`.
- On light preset save/delete, call `tray::refresh(app)`.
- On menu open, optionally rebuild from disk if Tauri exposes a practical hook;
  otherwise eager refresh after mutations is enough for V1.

## Test Plan

- `npm run rust:fmt:check`
- `npm run rust:clippy`
- Manual smoke:
  - left-click tray shows main window
  - right-click menu opens
  - Show/Hide toggles correctly
  - full-screen capture works while main window is hidden
  - area capture works while main window is hidden
  - preview toggles correctly
  - display preset applies from tray
  - stale preset names disappear after delete
  - Quit exits cleanly

## Risks

- Native menu APIs may limit icons, nested dynamic updates, and checked states.
  Keep V1 native and graduate to a small Tauri popup only for controls that
  native menus cannot express well.
- Capture actions must run fully in Rust because the main window can be hidden.
  Reuse the existing hotkey dispatch pattern.
- Applying presets from the tray needs clear error visibility. V1 can log errors
  and optionally emit a main-window status event; later work can show a toast.
