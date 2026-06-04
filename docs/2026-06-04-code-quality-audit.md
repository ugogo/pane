---
title: Code Quality Audit & Refactor
type: plan
status: in-progress
created: 2026-06-04
updated: 2026-06-04
---

# Code Quality Audit & Refactor

> **Handoff doc.** This is the single source of truth for the code-quality
> refactor of both Pane apps. It is **updated step by step** as work lands — check
> boxes as you complete them, append to the Progress Log, and keep `status` /
> `updated` current. Any agent should be able to resume cold from this file.
>
> Companion audit/roadmap: `~/.claude/plans/make-an-in-depth-audit-cheeky-barto.md`
> (same content, richer prose). This doc is the authoritative checklist.

## How to use this doc

1. Pick the **lowest-numbered unchecked task** in the current phase (phases are
   ordered so primitives exist before call sites adopt them).
2. Set `status: in-progress`; do the work in small commits (Conventional Commits).
3. Check the box, add a one-line entry to the **Progress Log** (date · what · commit).
4. Run the phase's verification gate (see **Verification**) before moving on.
5. When all boxes are checked, set `status: shipped` and bump `updated`.

**Guardrails (do not break):**

- `@pane/protocol` signing bytes + header encoding must stay identical — drift
  breaks pairing **silently**. Smoke-test real pairing after any protocol/query change.
- Rust COM/`unsafe` bodies (audio.rs, dynamic_lighting) change shape only via
  thin wrappers/macros — never touch the unsafe logic itself.
- Lint runs with `--max-warnings 0`; React Compiler forbids manual
  `useMemo`/`useCallback` in `apps/windows/src` (`react-compiler-no-manual-memoization`).
- Do **not** verify the Windows app in a browser/preview — Tauri IPC is undefined
  there and boot hangs. Run the real build or analyze statically.

## Overall assessment

Codebase is already high quality (strict ESLint flat config, Prettier, husky +
lint-staged, clippy `-D warnings`, CI, Rust companion test suite, excellent docs).
These are **convergence** refinements: the same problem is solved 3–5 different
ways across sibling files, and the idiomatic modern pattern (TanStack
`useMutation` + optimistic updates) is not yet used anywhere. No
correctness/security regressions are introduced.

## Findings index

Severity: **P1** broad reuse/clarity win · **P2** solid cleanup · **P3** nit.

| ID  | Sev  | Area       | Summary                                                      |
| --- | ---- | ---------- | ------------------------------------------------------------ |
| F1  | P1   | FE x-cut   | No `useMutation`; writes hand-rolled (async + setQueryData)  |
| F2  | P1   | FE x-cut   | Two competing optimistic-update strategies                   |
| F3  | P1   | FE x-cut   | `ProbeStatus`/`Status` type redefined ~6×                    |
| F4  | P1   | FE x-cut   | Status/error state hand-rolled inconsistently                |
| F5  | P2   | FE x-cut   | Tauri event-listener cleanup boilerplate repeated            |
| F6  | P2   | FE x-cut   | Debounced-write pattern duplicated 3×; drifting constants    |
| F7  | P3   | windows FE | `cn()` exists but not used consistently                      |
| F8  | P2   | windows FE | No shared Slider primitive (raw `<input type=range>` ×5)     |
| F9  | P2   | windows FE | `SoundCard` reducer over-engineered                          |
| F10 | P3   | windows FE | `CaptureCard` hotkey upsert duplicated                       |
| F11 | P2   | windows FE | `MainLayout` boot effect mixes three concerns                |
| F12 | P3   | windows FE | SoundCard `localStorage` favorites helpers inline            |
| F13 | P1   | mobile     | No shared `<Screen>` shell / theme tokens (hex literals)     |
| F14 | P1\* | mobile     | One debounce timer shared across all controls (drops writes) |
| F15 | P3   | mobile     | `control.tsx` repeats panel JSX                              |
| F16 | P3   | shared     | `bytesToHex` duplicated (protocol + mobile)                  |
| F17 | P2   | shared     | `PaneQueryProvider` near-duplicated                          |
| F18 | —    | shared     | Protocol types hand-mirrored — **out of scope** (codegen)    |
| F19 | P1   | Rust       | `#[tauri::command]` cfg/require_window boilerplate (~40×)    |
| F20 | P3   | Rust       | Hex encoding hand-rolled twice in companion.rs               |
| F21 | P3   | Rust       | Brightness monitor-loop preamble repeated                    |
| F22 | ✓    | Rust       | Lighting three-tier reuse — **template, do not disturb**     |

\* F14 is a behavior fix (dropped command), prioritized as P1.

## Checklist

### Phase 1 — Shared frontend primitives

`apps/windows/src/lib/` + `apps/windows/src/components/ui/`. No call-site changes yet.

- [x] **1.1** `lib/status.ts` — export canonical `Status` type + `StatusMessage`
      shape; re-point `components/features/status-ui.tsx`. (F3)
- [x] **1.2** `lib/use-tauri-event.ts` — `useTauriEvent(name, handler)` wrapping
      `listen` + cleanup. (F5)
- [x] **1.3** `lib/use-action-status.ts` — `{ status, message, set, clear }`. (F4)
- [x] **1.4** `lib/use-debounced-write.ts` — per-key debounced commit; single
      `WRITE_DEBOUNCE_MS` constant. (F6)
- [x] **1.5** `components/ui/slider.tsx` — thin native-range wrapper
      (`w-full` + disabled styling). (F8)

### Phase 2 — Adopt mutations + primitives across Windows cards

- [x] **2.1** AccentCard → `useMutation` + status hook. (F1/F4)
- [x] **2.2** InfraCard → `useMutation` + status hook (two `useActionStatus` —
      startup + sleep — replacing the `saved` bool + two string errors). (F1/F4)
- [x] **2.3** CompanionCard → `useMutation` (thunk variables) + status hook. (F1/F4)
- [x] **2.4** MetricsCard — no mutations/action state (only query error), so no
      `useActionStatus` needed; simplified the verbose error derivation. (F4)
- [x] **2.5** SoundCard → cache + mutations; deleted reducer/`displayState`/
      `isUnseeded`; extracted `lib/audio-favorites.ts`; per-kind `pending` ref
      preserves the external-echo guard. (F2/F9/F12)
- [x] **2.6** BrightnessCard → `useDebouncedWrite` + `useTauriEvent` + shared
      Slider; kept the documented sequential-DDC `eslint-disable`. (F1/F5/F6/F8)
- [x] **2.7** CaptureCard → mutations + `patchHotkey` helper (reducer removed). (F1/F10)
- [x] **2.8** LightingCard → shared Slider + `useActionStatus` per row. (F4/F8)
- [x] **2.9** `cn()` sweep: `_layout.tsx` nav + SoundCard className conditionals.
      (accent-popup/area-selector popups left as-is — single-ternary literals.) (F7)

### Phase 3 — MainLayout decomposition

- [x] **3.1** Extracted `useAppBoot()` (RAF/timer/version/window-show) +
      `useUpdateCheck()` (check + install lifecycle, owns `UpdateNoticeState`);
      `MainLayout` body went from ~110 lines to ~5. (F11)

### Phase 4 — Mobile companion

- [x] **4.1** `apps/mobile/lib/theme.ts` — `colors` + `statusColors` tokens;
      replaced hex literals in index/pair/control.styles/Slider + `statusColor`. (F13)
- [x] **4.2** `components/Screen.tsx` wrapper (dark shell + light status bar +
      optional centering); adopted in index/pair/control. (F13)
- [x] **4.3** Per-control debounce in `use-control-screen.ts` via a
      `commandKey(body)`-keyed timer map — independent brightness/volume/light
      writes (behavior fix). (F14)
- [x] **4.4** `lib/control/slider-panel.tsx` — `<SliderPanel>` collapses the
      brightness/volume/light panels in control.tsx. (F15)

### Phase 5 — Shared packages

- [ ] **5.1** Export `bytesToHex` from `@pane/protocol`; mobile imports it. (F16)
- [ ] **5.2** Move bare `PaneQueryProvider` into `@pane/query`; both apps compose
      it (mobile keeps its NetInfo/AppState wiring on top). (F17)

### Phase 6 — Rust backend (recompile-heavy; do last)

- [ ] **6.1** `to_hex(&[u8]) -> String` helper in companion.rs; use in
      `random_hex` + `sha256_hex`. (F20)
- [ ] **6.2** `with_monitors(|cache, monitors| …)` helper in brightness.rs;
      apply to `adjust_all`/`set_all_brightness_pct`/`apply_pcts`. (F21)
- [ ] **6.3** Command-boilerplate macro for the `require_window` + cfg pairs;
      collapse audio.rs `companion_*` wrappers + brightness.rs commands. Verify
      the `generate_handler!` set in lib.rs is byte-identical. (F19)

## Reuse — existing utilities (don't reinvent)

`cn()` (`src/lib/utils.ts`), `useEffectEvent` (`src/lib/use-effect-event.ts`),
`queryKeys` (`src/lib/query-keys.ts`), `StatusText`/`StatusBadge`
(`components/features/status-ui.tsx`), `createPaneQueryClient`
(`packages/query/src/client.ts`), Rust `require_window`
(`apps/windows/tauri/src/commands/mod.rs`), and the lighting three-tier pattern
(`lighting.rs` / `dx_light.rs`: `command` → `_inner` → `write_*`).

## Verification

**Every phase gate:**

```powershell
npm run typecheck
npm run lint
npm run companion:typecheck
```

**Rust phase additionally:**

```powershell
npm run rust:fmt:check
npm run rust:clippy
cargo test --manifest-path apps/windows/tauri/Cargo.toml   # companion auth suite must stay green
```

**Runtime (manual):**

- Windows: `npm run dev`; exercise Display (sliders + presets), Sound
  (switch/volume/mute), Lights (apply/off/restore), Capture (hotkeys + preview),
  Companion (pairing QR), Accents toggle, Diagnostics auto-refresh. Not via
  browser/preview.
- Mobile: `npm run companion`; pair against the desktop, confirm
  brightness/volume/light sliders debounce **independently** (F14), presets +
  system toggles + sleep work, offline state renders.
- **Pairing smoke test** after any `@pane/protocol` / `@pane/query` change.

## Out of scope

- F18 Rust→TS type codegen (`ts-rs`/`tauri-specta`) — deferred per
  [Monorepo Restructure plan](2026-06-02-monorepo-restructure-plan.md).
- Dependency bumps, signing/release changes, new design tokens beyond the mobile
  theme extraction.

## Progress Log

_Newest first. Format: `YYYY-MM-DD — task — note (commit)`._

- 2026-06-04 — Phase 4 complete — mobile theme tokens + `<Screen>` + `<SliderPanel>`;
  per-control debounce fix in use-control-screen. companion typecheck + lint green. (committed)
- 2026-06-04 — Phase 3 complete — `MainLayout` split into `useAppBoot` +
  `useUpdateCheck` hooks. typecheck + lint green. (committed)
- 2026-06-04 — Phase 2 complete — all 8 windows cards on `useMutation`/cache +
  shared `useActionStatus`/`useTauriEvent`/`useDebouncedWrite`/`Slider`; SoundCard
  reducer deleted + `lib/audio-favorites.ts` extracted; lights/sound/CaptureCard
  ProbeStatus → shared `Status`; `cn()` sweep. typecheck + lint green. (uncommitted)
- 2026-06-04 — Phase 1 complete — added `lib/status.ts`, `lib/use-tauri-event.ts`,
  `lib/use-action-status.ts`, `lib/use-debounced-write.ts`, `components/ui/slider.tsx`;
  re-pointed status-ui to `Status`. typecheck + lint green. (uncommitted)
- 2026-06-04 — Audit complete; this handoff doc created. No code changes yet.
