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

- **Frontend**: TypeScript + React + shadcn/ui on Tailwind v4 (Vite)
- **Backend**: Rust + Tauri 2
- **Entry point**: `apps/windows/src/App.tsx` -> `apps/windows/tauri/src/lib.rs`

## Commands

```powershell
npm run dev          # stop any existing dev session, then start fresh (Tauri + Vite)
npm run build        # production build
npm run typecheck    # TypeScript check
npm run stop         # kill dev without restarting
```

`npm run dev` always restarts: it stops leftover `pane.exe`, `cargo`, and Vite
processes for this repo before launching. Concurrent calls serialize via a
repo-scoped lock — the later call wins. Prefer `npm run dev` over raw
`tauri dev` or `npx vite`.

For CDP-driven WebView2 testing:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
npm run dev
```

> **Security:** the remote-debugging port has no authentication. Any local
> process can attach and drive Pane's Tauri IPC — including screen capture,
> clipboard, startup-registry, and hardware-lighting commands. Only enable CDP
> on a trusted dev machine, and never in a production build.

## Project layout

npm-workspaces monorepo. `apps/windows` and `apps/mobile` both depend on the
shared `@pane/protocol` contract, never on each other.

```
apps/
  windows/                       # Windows Tauri app (one app = FE + Rust)
  |-- index.html, vite.config.ts, tsconfig.json, package.json
  |-- src/                       # React + TypeScript frontend
  |   |-- App.tsx
  |   |-- components/features/   # One component per feature area
  |   `-- lib/commands.ts        # Typed invoke() wrappers for Rust commands
  `-- tauri/                     # Rust backend
      |-- tauri.conf.json
      `-- src/
          |-- lib.rs             # Tauri builder + managed state
          `-- commands/          # capture, hotkeys, lighting, metrics, startup, windows
  mobile/                        # Expo / React Native phone companion (@pane/companion)
packages/
  protocol/                      # @pane/protocol — shared HTTP wire contract (plain .ts)
```

## Settings

- Capture hotkeys: `%APPDATA%\dev.pane.app\capture-hotkeys.json`
- Light state: `%LOCALAPPDATA%\Pane\lights.json`

## Releases

Pane builds a signed NSIS installer with Tauri. The updater checks:

```text
https://github.com/ugogo/pane/releases/latest/download/latest.json
```

Two independent signatures are involved, and they must not be conflated:

- **Updater signing** (minisign): signs `latest.json` / the installer artifact
  so the Tauri updater accepts it. Configured by `scripts/release.ps1`.
- **Authenticode / code signing** (Windows cert): signs the sparse identity
  MSIX so Windows registers package identity. Configured by
  `scripts/build-identity-package.ps1`. Pane is a personal app and ships
  **self-signed** releases — `scripts/release.ps1` does this automatically with
  no cert or flag, and the installer's POSTINSTALL hook trusts the bundled
  public cert per-machine so the package registers. The tradeoff is that each
  installing machine trusts a cert generated on the build host. (For a real CA
  cert later, call `build-identity-package.ps1` directly without
  `-DevSelfSigned` and supply `-PfxPath` + `PANE_SIGNING_PFX_PASSWORD`.)
