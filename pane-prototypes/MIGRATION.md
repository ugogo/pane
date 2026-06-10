# Pane redesign → app migration

A handoff guide for the agent tasked with bringing the **real Pane app** in line
with the chosen redesign. This document describes the target design, maps it to
the existing codebase, and — most importantly — sets the rules of engagement.

---

## 0. The golden rule: ASK, don't assume

> **You must not assume anything about feature behaviour, scope, or parity.
> When a decision isn't fully specified here, STOP and ask the maintainer
> (gnoukk@gmail.com / the PR thread) before writing code.**

This redesign is a **visual/UX exploration built on mock data**. It deliberately
*reimagined, added, and dropped* things (e.g. it promotes a command palette and a
hotkeys manager that don't exist in the app yet, and it renames/relabels some
surfaces). That means the prototype is **not** an authority on feature behaviour —
only on look, layout, type, spacing, motion, and interaction *feel*.

Concretely, before implementing any area you must confirm, in writing, with the
maintainer:

- **Parity vs. change** — for each feature area, is the goal to (a) keep current
  app behaviour and only restyle, (b) adopt the prototype's reorganisation, or
  (c) something else? Do not infer this from the prototype.
- **New/pending features** — the command palette and the global hotkeys manager
  are prototype-only "pending" concepts. Confirm whether they are in scope now,
  later, or not at all.
- **Renames** — the prototype labels differ from the app routes (see §4). Confirm
  the canonical names before changing any user-facing string or route.
- **Removed/added controls** — if the prototype shows a control the app lacks (or
  omits one the app has), ask whether to add/remove it. Never silently drop a
  real capability to match a mock.
- **Data semantics** — ranges, units, defaults, device discovery, and what each
  control actually writes to hardware come from the Rust commands, not the mock.
  Confirm mappings.

If in doubt: ask. A wrong assumption that ships is more expensive than a question.

---

## 1. What was chosen

**Direction 3 — "Terminal-calm"** (OpenAI Codex-leaning): monospace-forward,
near-black, high-contrast, typography-and-alignment-led, quiet chrome.

Final tweaks already baked into the prototype:

- Type scale bumped to ~**110%** of the base scale, rounded to whole pixels.
- **Headings** use **Geist** (sans); **body, data, metadata, chords, readouts**
  stay **Geist Mono**. This sans/mono split is intentional — preserve it.
- Brand mark is the **app favicon artwork** (`public/favicon.svg`).
- Accent is a **blue-violet `#636aff`** — the midpoint of the favicon's
  purple→blue gradient.

Run it to study the target:

```bash
cd pane-prototypes
npm install
npm run dev      # open the launcher, press 3 (or ⌘/Ctrl-3) for Terminal-calm
```

Source of truth for the design: `src/prototypes/terminal-calm/` plus the shared
building blocks in `src/shared/` and the global tokens in `src/index.css`.

---

## 2. Design system (the part that must match)

All tokens live in `pane-prototypes/src/index.css` (`:root`) and the prototype
root `.tc` in `src/prototypes/terminal-calm/styles.css`. Reproduce these as
Tamagui theme/tokens in `@pane/ui` — match the **values and relationships**, not
the literal CSS.

### Fonts

| Role | Family | Notes |
|---|---|---|
| Headings/titles | **Geist** (`--font-display`) | sans; natural letter-spacing (do **not** add tracking) |
| Body, data, labels, chords, readouts | **Geist Mono** (`--font-mono`) | mono; tracking `-0.01em`, ligatures off, tabular numerals for figures |

Fonts are bundled via `@fontsource-variable/*` (no CDN). The app must bundle them
too (it already ships fonts under `apps/windows/assets/fonts`).

### Type scale (Terminal-calm, rounded ~110%)

`12 · 13 · 14 · 15 · 16 · 19 · 22 · 26 · 33 · 42 · 57` (px), plus a `--t-micro`
of `11px` for uppercase pill labels. Base body size is `14px`, line-height `1.5`.

### Spacing scale (4/8 base)

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80` (`--s-1 … --s-16`). Every
margin/padding/gap snaps to this — no off-grid values.

### Radii

`--r-xs 4 · sm 6 · md 10 · lg 14 · xl 20 · full 999`.

### Color tokens (Terminal-calm)

```
--accent   #636aff   (blue-violet; see §3 for how it's themed)
--bg       #0a0b0d   near-black, cool-neutral
--panel    #0e0f13   --panel-2 #101218
--line     rgba(255,255,255,.07)   --line-2 rgba(255,255,255,.12)
--text     #e9eaef
--dim      #8f9298   (AA on near-black)   --faint #656870
--danger   #ff6b6b   --warn #ffb020
```

Semantic, non-theme colors that must stay regardless of accent: the **RGB gain
sliders** (red/green/blue channels) and the **warmth/saturation** sliders encode
meaning, not branding.

### Motion & focus

- One transition signature: `0.14s var(--ease)` (`cubic-bezier(.22,1,.36,1)`).
  Use sparingly; this design is calm.
- Keyboard focus: a 2px accent-tinted `:focus-visible` ring. Preserve it.

---

## 3. Theming / "easily updatable" accent

The accent is **single-source**: `src/prototypes/terminal-calm/theme.ts`
(`export const ACCENT`). It is:

1. injected as the `--accent` CSS custom property on the prototype root (so every
   `styles.css` rule that uses `var(--accent)` updates), and
2. passed to the command palette, capture overlay, and sparkline, and
3. consumed by `registry.ts` for the launcher/switcher swatch.

Change that one constant to re-theme. (The `--accent` literal in `styles.css` is
only a fallback.) **In the app, mirror this**: the accent must be a single theme
token in `@pane/ui`, not hardcoded per component.

---

## 4. Feature-area map (prototype → app → backend)

The prototype covers ten areas. Below is the mapping to the existing app. **Treat
the "Behaviour" column as questions to confirm, not instructions.**

| Prototype area | App route (`apps/windows/app/(main)/`) | Tauri command(s) (`apps/windows/tauri/src/commands/`) | Mock action (`src/mock/store.tsx`) |
|---|---|---|---|
| Capture | `capture.tsx` + `(views)/` preview, area-selector, image-editor, capture-zoom | `capture.rs`, `capture_sound.rs`, `desktop_duplication.rs`, `windows.rs` | `addCapture`, `saveCapture` |
| Display | `display.tsx` | `brightness.rs` | `setMonitor`, `setGain`, `applyDisplayPreset` |
| Sound | `sound.tsx` | `audio.rs` | `setSound`, `toggleMute` |
| Lights | `lights.tsx` | `lighting.rs`, `ambient.rs`, `dynamic_lighting.rs`, `dx_light.rs`, `light_presets.rs`, `light_state.rs` | `setLight`, `toggleLight`, `applyLightPreset`, `setAmbient`, `restoreLights`, `allLightsOff` |
| Accents | `accent.tsx` + `(views)/accent-popup.tsx` | `accent.rs` | `toggleAccents`, `setAccents` |
| Hotkeys | **no route yet** (pending) | `hotkeys.rs` (exists) | `setHotkeyChord`, `toggleHotkey`, `addRemap`, `updateRemap`, `removeRemap` |
| Command palette | **none yet** (pending; prototype centerpiece) | — | `src/mock/commands.ts` |
| System | `startup.tsx` (+ system) | `startup.rs`, `system.rs` | `toggleStartup`, `sleepNow` |
| Companion | `companion.tsx` | `companion.rs`, `companion_snapshot.rs` | `pairCompanion`, `revokeCompanion` |
| Diagnostics | `diagnostics.tsx` | `metrics.rs` | (static) |

⚠️ **Gaps to raise with the maintainer up front:** the app has **no Hotkeys
route and no Command Palette** yet (these are the prototype's "pending,
first-class" features), and the prototype's **"System"** maps to the app's
**`startup`** route. Confirm scope and naming before building either.

---

## 5. Target stack translation

The prototype is **bespoke CSS + React DOM + a mock store**. The app is a
different stack — do **not** copy CSS/DOM verbatim. Translate:

| Prototype | App target |
|---|---|
| Plain CSS + CSS variables (`src/index.css`, `*.css`) | **Tamagui** theme + tokens in `@pane/ui` (`packages/ui`, `tamagui.config.cjs`) + the app's `global.css`/`shell.css` |
| React DOM elements (`div`, `input[range]`, …) | Tamagui / React-Native-Web primitives via `@pane/ui` |
| `src/mock/store.tsx` (in-memory) | Real state via `@pane/query` + `@pane/protocol` calling Tauri commands |
| `src/shared/*` components (palette, capture overlay, sliders, chord capture, toasts) | New `@pane/ui` components matching the look; reuse existing `apps/windows/src/components` where present |
| Hash router + launcher + switcher | **N/A** — scaffolding for the prototype only. Do not port. |

Mock-only scaffolding you should **ignore** (not migrate): `launcher/`,
`registry.ts`, `shared/Chrome.tsx` (prototype switcher), `puppeteer` dev usage,
and the other four prototype directories.

---

## 6. Component & interaction inventory (match the feel)

From `src/shared/` and `src/prototypes/terminal-calm/`:

- **Command palette** (`shared/CommandPalette.tsx`): ⌘/Ctrl-K, fuzzy filter,
  keyboard nav, recents/suggested, monospace metadata, grouped results. Mono
  surface variant. *(Pending feature — confirm scope.)*
- **Capture flow** (`shared/CaptureOverlay.tsx` + `capture.tsx`): choose
  fullscreen/area → drag-select overlay → preview → action bar (copy, save,
  edit, enlarge) → lightweight editor. Maps to the app's `(views)` screens.
- **Chord capture** (`shared/keys.ts` `useChordCapture`): press-to-bind input
  with conflict detection and a remap (from→to) list. *(Pending feature.)*
- **Accents playground** (`shared/AccentsPlayground.tsx`): long-press-for-
  diacritics demo.
- **Controls**: slider (track-fill + thumb driven by `--tint`/`--pct`), iOS-free
  toggle, status lines that read like shell output (`✓ applied · 3 sources`),
  hairline section labels, breadcrumb, sparkline for diagnostics.

Match their **behaviour and rhythm**; rebuild them as `@pane/ui` components.

---

## 7. Suggested phasing (confirm before starting)

1. **Design tokens first** — port fonts, type scale, spacing, radii, color
   tokens, motion, focus ring into `@pane/ui` as a theme. Get one screen pixel-
   close, review with maintainer, then proceed.
2. **Restyle existing routes** in their current behaviour (Capture, Display,
   Sound, Lights, Accents, System/startup, Companion, Diagnostics) — visual only,
   no behaviour changes, one area at a time, each reviewed.
3. **Pending features** (Hotkeys manager, Command palette) — only after explicit
   go-ahead and a behaviour spec from the maintainer.

---

## 8. Fidelity checklist

- [ ] Fonts: Geist headings + Geist Mono body, with the documented tracking;
      tabular numerals on figures.
- [ ] Type scale and spacing match the tokens in §2 (no off-grid values).
- [ ] Accent is one theme token; default `#636aff`; semantic slider colors kept.
- [ ] Near-black cool-neutral surfaces; AA-legible dim/faint text.
- [ ] One transition signature; accent focus-visible ring present.
- [ ] Favicon artwork used as the brand mark.
- [ ] No real capability was dropped to match the mock (verified with maintainer).
- [ ] Every renamed/added/removed surface was confirmed with the maintainer.

---

## 9. Scope guardrails

- Do **not** modify `pane-prototypes/` while migrating the app — it's the
  reference, kept intact.
- Do **not** port the prototype's router/launcher/switcher or mock store.
- Do **not** change Rust command signatures or hardware behaviour to fit the UI
  without confirmation.
- When the prototype and the app disagree, the **app's real behaviour wins** until
  the maintainer says otherwise — and you ask first.
