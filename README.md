# Home

Windows utility suite — **Light Controls** and **CleanShot** in one PowerToys-style hub.

## Stack

- **Tauri 2** (Rust backend + React/TypeScript/Tailwind frontend)
- `src-tauri/` — Rust commands (HID, screen capture, hotkeys, tray, registry)
- `src/` — React frontend (Vite + Tailwind + shadcn)

## Commands

```powershell
npm run dev          # full Tauri dev (Vite frontend + Rust backend)
npm run build        # production build
npm run stop         # kill stuck dev instances
```

## Project layout

```
src/                             # React + TypeScript frontend
├── App.tsx
├── components/features/         # One component per feature area
└── lib/commands.ts              # Typed invoke() wrappers for all Rust commands

src-tauri/                       # Rust backend
├── tauri.conf.json
└── src/
    ├── lib.rs                   # Tauri builder + managed state
    └── commands/                # capture, hotkeys, hid, metrics, startup, windows
```

## Settings

- Capture hotkeys: `%APPDATA%\dev.home.app\capture-hotkeys.json`
