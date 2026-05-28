# Pane

Pane is a Windows desktop utility hub for small, fast system tools. It currently
brings **Light Controls** and **CleanShot-style capture** into one Tauri app,
with more modules intended to fit into the same dashboard over time.

## Modules

- **Light Controls**: MSI Mystic Light, Windows Dynamic Lighting devices, and
  DxLight control with saved state and wake restore.
- **CleanShot**: fullscreen and region capture, floating preview, clipboard,
  save-to-desktop, shutter sound, and global capture hotkeys.
- **Infrastructure**: tray resident app, hide-to-tray, single-instance focus,
  startup registry toggle, metrics, packaging, and updater support.

## Stack

- **Frontend**: TypeScript + React + Tailwind on Vite
- **Backend**: Rust + Tauri 2
- **Entry point**: `src/App.tsx` -> `src-tauri/src/lib.rs`

## Commands

```powershell
npm run dev          # full Tauri dev (Vite frontend + Rust backend)
npm run build        # production build
npm run typecheck    # TypeScript check
npm run stop         # kill stuck dev instances
```

For CDP-driven WebView2 testing:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
npm run dev
```

## Project layout

```
src/                             # React + TypeScript frontend
|-- App.tsx
|-- components/features/         # One component per feature area
`-- lib/commands.ts              # Typed invoke() wrappers for Rust commands

src-tauri/                       # Rust backend
|-- tauri.conf.json
`-- src/
    |-- lib.rs                   # Tauri builder + managed state
    `-- commands/                # capture, hotkeys, lighting, metrics, startup, windows
```

## Settings

- Capture hotkeys: `%APPDATA%\dev.pane.app\capture-hotkeys.json`
- Light state: `%LOCALAPPDATA%\Pane\lights.json`

## Releases

Pane builds a signed NSIS installer with Tauri. The updater checks:

```text
https://github.com/ugogo/pane/releases/latest/download/latest.json
```

Release signing uses the local/upstream updater key configured by
`scripts/release.ps1`.
