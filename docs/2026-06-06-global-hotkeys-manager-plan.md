---
title: Global Hotkeys Manager Plan
type: plan
status: proposed
created: 2026-06-06
updated: 2026-06-06
---

# Global Hotkeys Manager Plan

## Summary

Replace the current capture-only shortcut settings with a global hotkeys manager
that can bind multiple Pane actions, detect conflicts, restore shortcuts on
startup, and provide one consistent UI for shortcut editing.

The existing `commands/hotkeys.rs` is a good first slice but its data model is
hard-coded to two capture actions. This plan generalizes it without changing the
capture workflow behavior.

## Goals

- Manage all user-configurable global shortcuts in one place.
- Preserve existing fullscreen and area capture bindings.
- Support future actions such as command palette, toggle preview, sleep
  computer, apply presets, restore lights, and show/hide Pane.
- Detect duplicate bindings inside Pane before registration.
- Surface OS registration failures clearly.
- Persist shortcuts in one schema with room for action metadata.

## Non-goals

- Per-app conditional shortcuts in V1.
- Complex macro recording.
- Cloud sync.
- Editing shortcuts from the tray menu.

## Delivery Approach

| Slice | Scope                                                                                                  | Validation                                                              |
| ----- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1     | Generalize Rust hotkey model from `CaptureAction` to `HotkeyAction` while preserving current commands. | Existing capture hotkeys still load, set, clear, and dispatch.          |
| 2     | Add manager commands to list all actions and set/clear by action id.                                   | Rust tests for duplicate detection, clear, and migration from old JSON. |
| 3     | Add a System or dedicated Hotkeys page UI using `ShortcutInput`.                                       | `npm run lint`, `npm run typecheck`, manual binding flow.               |
| 4     | Add more actions and route old Capture page controls to the shared manager.                            | Manual smoke for each action and startup restore.                       |

## Action Model

Candidate Rust enum:

```rust
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum HotkeyAction {
    CaptureFullscreen,
    CaptureArea,
    ToggleCapturePreview,
    ShowPane,
    OpenCommandPalette,
    RestoreLights,
    SleepComputer,
}
```

The frontend can display richer labels from a shared TypeScript registry, while
Rust owns the authoritative dispatch list.

## Persistence

Move from `capture-hotkeys.json` to `hotkeys.json`:

```json
{
  "version": 1,
  "bindings": {
    "capture-fullscreen": "Ctrl+Shift+1",
    "capture-area": "Ctrl+Shift+2"
  }
}
```

Migration:

- On first load, if `hotkeys.json` does not exist, read
  `capture-hotkeys.json`.
- Map `fullscreen` to `capture-fullscreen`.
- Map `area` to `capture-area`.
- Save the new file after successful restore or first mutation.
- Leave the old file in place for one release unless cleanup is needed.

## Rust Touchpoints

- Refactor `apps/windows/tauri/src/commands/hotkeys.rs`.
- Keep `restore_capture_hotkeys` as a compatibility wrapper or rename it to
  `restore_hotkeys` and update startup code.
- Add commands:
  - `list_global_hotkeys() -> Vec<HotkeyBindingView>`
  - `set_global_hotkey(action: HotkeyAction, accelerator: String) -> HotkeyResult`
  - `clear_global_hotkey(action: HotkeyAction)`
  - keep `get_capture_hotkeys`, `set_capture_hotkey`, and
    `clear_capture_hotkey` as compatibility wrappers for the Capture page until
    the UI moves.
- Dispatch actions through Rust service functions, not frontend route state.

## Frontend Touchpoints

- Add action metadata in `apps/windows/src/lib/hotkey-actions.ts`.
- Add wrappers in `apps/windows/src/lib/commands.ts`.
- Add `globalHotkeys` to `apps/windows/src/lib/query-keys.ts`.
- Reuse `apps/windows/src/components/ShortcutInput.tsx`.
- Decide placement:
  - V1: add a Hotkeys card to `apps/windows/app/(main)/startup.tsx`.
  - Later: split into `apps/windows/app/(main)/hotkeys.tsx` and add a sidebar
    module if the list grows.
- Update Capture page to read/write via compatibility wrappers or the new
  manager once both paths are stable.

## Conflict Handling

Validate before registration:

- If another Pane action already uses the accelerator, return a typed conflict
  error with the conflicting action id.
- If OS registration fails, keep previous binding intact and surface the plugin
  error message.
- If the same action is rebound, unregister its old accelerator first.
- Empty accelerator continues to mean clear.

## Test Plan

- `npm run lint`
- `npm run typecheck`
- `npm run rust:fmt:check`
- `npm run rust:clippy`
- Rust tests:
  - migrate old capture settings
  - reject duplicate binding
  - keep old binding when new registration fails
  - clear binding unregisters accelerator
  - dispatch each action from a synthetic shortcut event where practical
- Manual smoke:
  - existing capture hotkeys survive migration
  - bind fullscreen capture
  - bind area capture
  - duplicate binding shows conflict
  - restart Pane and confirm shortcuts restore
  - hide main window and trigger capture hotkeys

## Risks

- Some shortcuts cannot be registered because Windows or another app owns them.
  Treat plugin registration failure as expected user-facing state, not an
  exceptional crash.
- `OpenCommandPalette` is different from other actions because it needs the main
  frontend window focused and an event emitted. Implement it after the palette
  exists.
- A large hotkey list can overwhelm the System page. Start compact, then split
  into a dedicated route if needed.
