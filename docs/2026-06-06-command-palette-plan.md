---
title: Pane Hub Search and Command Palette Plan
type: plan
status: proposed
created: 2026-06-06
updated: 2026-06-06
---

# Pane Hub Search and Command Palette Plan

## Summary

Add a search bar and command palette to the Pane hub so users can jump to
modules, run common commands, and find settings without hunting through the
sidebar.

The palette should be a frontend-owned command registry that can call existing
Tauri commands through typed wrappers. Rust should only grow new commands when a
palette action needs backend behavior that does not already exist.

## Goals

- Add a search affordance in the app shell header.
- Open a command palette with `Ctrl+K` and a clickable search box.
- Support navigation commands for all current modules.
- Support action commands for common workflows: capture full screen, select
  area, show/hide floating preview, restore lights, sleep computer, open
  diagnostics, start companion pairing.
- Make command labels, keywords, availability, and execution status explicit.

## Non-goals

- Global OS-level palette while Pane is not focused. That belongs to the global
  hotkeys manager.
- Plugin marketplace.
- Natural-language command interpretation.
- Indexing capture image contents.

## Delivery Approach

| Slice | Scope                                                                                                   | Validation                                                 |
| ----- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1     | Extract the existing module list from `apps/windows/app/(main)/_layout.tsx` into a shared hub registry. | Sidebar behavior unchanged.                                |
| 2     | Add a local command registry and palette overlay with fuzzy filtering.                                  | `Ctrl+K`, click search, keyboard navigation, Escape close. |
| 3     | Wire action commands through existing invoke wrappers.                                                  | Manual smoke for each action and error state.              |
| 4     | Add contextual commands and command metadata, such as disabled reasons when no capture exists.          | Manual route-specific QA.                                  |

## Command Registry

Create a frontend registry, for example:

- `apps/windows/src/lib/hub-modules.ts`
- `apps/windows/src/lib/command-registry.ts`

Candidate shape:

```ts
interface PaneCommand {
  id: string;
  title: string;
  subtitle?: string;
  keywords: string[];
  section: 'Navigation' | 'Capture' | 'Lights' | 'System' | 'Companion';
  icon: ComponentType<{ size?: number }>;
  isAvailable?: () => boolean | Promise<boolean>;
  run: () => void | Promise<void>;
}
```

Keep the registry declarative and close to existing command wrappers. Avoid
adding a global event bus unless real cross-module state requires it.

## Frontend Touchpoints

- `apps/windows/app/(main)/_layout.tsx`
  - Add a compact search button/input in the sticky header.
  - Mount `CommandPalette`.
  - Listen for `Ctrl+K` and possibly `Ctrl+P`.
- `apps/windows/src/lib/commands.ts`
  - Reuse existing command wrappers.
  - Add missing wrappers only for already-registered Tauri commands.
- `apps/windows/app/shell.css`
  - Add overlay, palette, result row, and keyboard focus styles.
- `@pane/ui`
  - Re-export missing lucide icons if needed.

## UX Notes

- The header search should look like an input but behave as a button that opens
  the palette. Text entry happens inside the overlay.
- Result rows should be dense and keyboard-first:
  - Up/Down changes active result.
  - Enter runs.
  - Escape closes.
  - Clicking a result runs it.
- Keep result text within row bounds at the default 800-900 px width.
- Show recent or suggested commands when the query is empty.
- For unavailable actions, either hide them or show disabled rows with a short
  reason. Prefer hiding until disabled reasons are reliable.

## Search Behavior

V1 can use a small local scorer:

- exact prefix match on title wins
- acronym or word-prefix match next
- keyword includes next
- subtitle includes last

Avoid adding a dependency until the command list grows enough to justify it.

## Rust Touchpoints

No Rust work is required for navigation and most actions. New commands may be
useful later for:

- `show_main_window` as an invoke command if palette actions need to interact
  with tray state.
- Querying richer availability, such as whether a latest capture exists, without
  transferring image data.

## Test Plan

- `npm run lint`
- `npm run typecheck`
- Manual smoke:
  - open with `Ctrl+K`
  - open by clicking search
  - navigate to every module
  - run fullscreen capture
  - run area capture
  - toggle preview
  - run restore lights with no lights and with lights
  - close with Escape and by clicking outside
  - verify focus returns to the trigger

## Risks

- A palette can become an unstructured dumping ground. Keep commands grouped by
  module and add actions only when they represent real workflows.
- Some commands open or close child windows. Those actions should reuse Rust
  orchestration commands so the frontend context is not destroyed mid-flow.
- Global shortcuts may conflict with `Ctrl+K`. The global hotkeys manager should
  detect conflicts once it exists.
