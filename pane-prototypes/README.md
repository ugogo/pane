# Pane — design prototypes

Five genuinely different UI/UX directions for **Pane**, a Windows desktop
control-center utility: one tray app that consolidates screen **capture**,
**display** control, **sound**, **RGB lighting**, an **accents** typing helper,
global **hotkeys**, a **command palette**, **system** controls, an iPhone
**companion**, and **diagnostics**.

This is a **design exploration** — runnable, clickable, fully mocked. There is
no backend and no Tauri IPC; everything is local fake state that actually
reacts (sliders move, toggles flip, presets apply and visibly change state, the
palette filters and "runs" commands with toast feedback, the capture flow
completes). It is intentionally a standalone Vite project so it never depends on
the Windows/Tauri build environment.

## Run

```bash
npm install
npm run dev
```

Open the printed local URL. The **launcher** lists all five prototypes. Jump
between them any time:

- **⌘/Ctrl + 1…5** — open a prototype
- **⌘/Ctrl + 0** — back to the launcher
- the floating **switcher** (bottom-center) is always available
- inside any prototype, **⌘/Ctrl + K** opens the **command palette**

Each prototype keeps its place (current page/tab) when you jump away and back.

```bash
npm run build     # type-check + production build
```

## The five directions

All five share one through-line: **typography and spacing discipline**. They
draw on Raycast (keyboard-first, dense-but-elegant), OpenAI's Codex app (calm,
monospace-accented, content-first), and Apple's System Settings / SF language
(whitespace, restraint, soft materials). Each reimagines the *same ten feature
areas* — the layouts diverge, the data layer is shared.

> **Chosen direction:** Terminal-calm (prototype 3). To migrate the real Pane
> app to it, see **[`MIGRATION.md`](./MIGRATION.md)** — a handoff guide whose
> first rule is: for feature parity, **ask the maintainer, don't assume.**

1. **Command-first** _(Raycast-leaning)_ — the command palette is the primary
   surface. A tight left rail, compact keyboard-navigable list rows, monospace
   metadata, dark and fast. Optimized for power users who drive by keyboard.

2. **Settings-spacious** _(Apple-leaning)_ — sidebar + roomy detail panes, large
   SF-style headings, soft grouped "inset" cards, lots of breathing room, and a
   real **light/dark** toggle. Optimized for legibility and calm discoverability.

3. **Terminal-calm** _(Codex-leaning)_ — monospace-forward, high contrast, a
   restrained near-black/green palette. Typesetting and rhythm do the work; a
   `❯` prompt opens the palette and actions echo clean shell-style status lines.
   Dense but elegant.

4. **Glance dashboard** — a single spatial **bento grid** of live tiles you
   operate in place (brightness, volume, lights, latest capture, quick actions),
   with the deeper areas in expanding tiles / a detail drawer. Minimal
   navigation; everything important at a glance.

5. **Companion-led / compact** — touch-friendly, rendered inside a **phone
   frame** with a bottom tab bar and big tap targets. Doubles as a vision for the
   iPhone companion that pairs with the desktop app.

## Architecture

```
src/
  mock/            # the shared, fake data layer
    types.ts       #   domain types (monitors, audio, lights, hotkeys, …)
    data.ts        #   realistic seed state
    store.tsx      #   React context store + typed actions (usePane / useActions)
    commands.ts    #   command registry the palette runs
  shared/          # cross-prototype building blocks (theme-able)
    CommandPalette.tsx   # fuzzy search, keyboard nav, recents, mono metadata
    CaptureOverlay.tsx   # the full capture flow (choose → drag → preview → edit)
    capture.tsx          # useCaptureFlow() state machine + MockScreenshot
    AccentsPlayground.tsx# long-press-for-diacritics demo
    keys.ts              # hotkeys, chord capture, chord formatting
    fuzzy.ts, toast.tsx, usePersistentState.ts, Chrome.tsx (switcher + toasts)
  prototypes/
    command-first/  settings-spacious/  terminal-calm/
    glance-dashboard/  companion-compact/   # each fully self-contained
  launcher/        # landing page
```

**Design tokens** live in `src/index.css` (`:root`): a deliberate type scale
(`--t-2xs … --t-5xl`), a 4/8px spacing scale (`--s-1 … --s-16`), radii, easing,
and font stacks. Fonts are **bundled** via `@fontsource` (Inter / Geist for UI,
Geist Mono / JetBrains Mono for monospace) — no runtime CDN dependency.

The data layer is deliberately small; the investment is in type scale, rhythm,
alignment, and motion restraint. State is shared across prototypes, so a preset
you apply in one is reflected when you switch to another.

## Choosing a direction — a comparison

| Direction | Optimizes for | Strongest areas | Weakest fit |
|---|---|---|---|
| **Command-first** | Speed & keyboard control; muscle memory | Command palette, Hotkeys, Capture | Lights/Display feel cramped at a glance |
| **Settings-spacious** | Legibility, discoverability, calm | Display, Sound, System, Accents | Power-user speed; more clicks |
| **Terminal-calm** | Focus & precision; typography as UI | Hotkeys, Diagnostics, Command palette | Approachability for non-technical users |
| **Glance dashboard** | At-a-glance status + in-place control | Lights, Capture, Display, Sound | Deep/rare settings (pushed to a drawer) |
| **Companion-led** | Touch, reach, a phone-companion vision | Lights, Capture, Sound, Companion | Dense desktop multitasking; chord capture is aspirational on touch |

**How to read it**

- **Command-first** treats the palette as the product: every action is two
  keystrokes away, pages are dense scannable rows, metadata is monospace. Pick
  it if Pane lives in muscle memory and you rarely "browse."
- **Settings-spacious** is the safest, most familiar surface — it scales to many
  more settings without feeling busy, and is the only direction with a true
  light mode. Pick it for broad-audience legibility.
- **Terminal-calm** is the most opinionated: monospace, high-contrast, status
  lines that read like shell output. Pick it for a focused, "instrument" feel —
  it flatters the technical features (hotkeys, diagnostics) most.
- **Glance dashboard** is the best "tray pop-over" — open it, see and adjust
  everything live, close it. The bento tiles make Lights and Capture sing;
  deeper config lives in a slide-over drawer so the wall stays calm.
- **Companion-led** doubles as the iPhone companion spec: big targets, bottom
  tabs, a device frame. Pick it to validate the phone experience and remote
  control story.

A pragmatic combination: ship **Glance dashboard** as the tray pop-over,
**Settings-spacious** as the full window, with **Command-first**'s palette
(⌘K) available everywhere — and use **Companion-led** as the phone app spec.
