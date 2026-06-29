# AGENTS.md

## Stack

**Pane** is a Windows desktop utility suite: **Light Controls** and
**CleanShot** in one modular hub, with more modules expected over time.

- **Frontend**: TypeScript + React + Vite + TanStack Router + Pickle UI/Tailwind on Windows web; Expo + React Native + Tamagui (`@pane/ui`) for the companion
- **Backend**: Rust + Tauri 2
- **Entry point**: `apps/windows/src/main.tsx` -> `apps/windows/tauri/src/lib.rs`

## Running the app

```powershell
pnpm run dev          # stop any existing dev session, then start fresh (Tauri + Vite)
pnpm run stop         # kill dev without restarting
```

`pnpm run dev` always restarts: it stops leftover `pane.exe`, `cargo`, and Vite
processes for this repo before launching. Concurrent calls serialize via a
repo-scoped lock — the later call wins. Prefer `pnpm run dev` over raw
`tauri dev` or `vite`.

For CDP-driven testing, set the env var before starting:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
pnpm run dev
```

WebView2 then exposes Chrome DevTools Protocol on port 9222.

> **Security:** the CDP port has no authentication. Any local process can
> attach and drive Pane's Tauri IPC — screen capture, clipboard, startup
> registry, and hardware-lighting commands. Only enable CDP on a trusted dev
> machine, and never in a production build.

## Code style & quality

Formatting and linting are enforced; don't hand-format.

- **Frontend**: ESLint (flat config, `eslint.config.ts` — loaded natively, no
  jiti) + Prettier (`.prettierrc.json`). Plugins: typescript-eslint,
  react-hooks (incl. the React Compiler lints), react-refresh,
  react-you-might-not-need-an-effect, and react-doctor (`recommended`).
- **Rust**: rustfmt (`apps/windows/tauri/rustfmt.toml`) + clippy (`-D warnings`).
- **No `.js` config files**: ESLint config is TypeScript (`eslint.config.ts`);
  Windows app bundling uses Vite (`apps/windows/vite.config.ts`); the companion still uses Metro (`apps/mobile/metro.config.js`).
- **Warnings are errors**: lint runs with `--max-warnings 0`, so a warning
  fails the build/commit. Suppress a genuine false positive with a narrow
  `// eslint-disable-next-line <rule>` plus a one-line reason (current ones:
  the hardware-sequential DDC writes in `BrightnessCard`, and the mount fetch
  in `CapturePreview`).

```powershell
pnpm run lint           # eslint . --max-warnings 0
pnpm run lint:fix       # eslint . --fix --max-warnings 0
pnpm run format         # prettier --write .
pnpm run format:check   # prettier --check .
pnpm run rust:fmt       # cargo fmt
pnpm run rust:clippy    # cargo clippy --all-targets -- -D warnings
```

- **Format on save**: `.vscode/settings.json` enables format-on-save (Prettier
  for web assets, rustfmt for Rust) plus ESLint autofix. Install the
  recommended extensions when VS Code prompts.
- **Agents**: a `PostToolUse` hook (`.claude/settings.json` →
  `scripts/format-file.ts`) formats every file an agent writes, so agent edits
  match save-on-format output without a manual pass.
- **Pre-commit**: husky + lint-staged run Prettier + ESLint `--fix` on staged
  JS/TS and rustfmt on staged Rust; clippy runs when any Rust file is staged.
- **CI** re-checks `lint`, `format:check`, `cargo fmt --check`, and clippy.
- **React Compiler** is enabled (`babel-plugin-react-compiler` in Babel), so components are auto-memoized — don't hand-add
  `useMemo`/`useCallback` (the `react-compiler-no-manual-memoization` rule
  enforces this). Effects that need the latest props/state without re-subscribing
  use `useEffectEvent`; data fetched in an effect sets state from a deferred
  `.then`/`.catch` callback so it doesn't trip `set-state-in-effect`.

## UI Guidelines

- Windows uses pinned `pickle-ui` primitives through `pickle-ui/styles.css`, compiled by Vite through `apps/windows/src/styles/windows.source.css` after Tailwind as documented by Pickle.
- Windows enables TanStack Router `autoCodeSplitting` in `apps/windows/vite.config.ts`
  so route components ship as lazy chunks without hand-written `.lazy.tsx`
  route files.
- The companion continues to use [`packages/ui`](packages/ui) (`@pane/ui`) with Tamagui's `dark` theme, native controls, and `UIProvider`.
- Keep Windows composites DOM-native; do not recreate Tamagui's prop API in Windows.
- Reusable companion motion belongs in `@pane/ui`; Windows motion uses CSS and must respect `prefers-reduced-motion`.
- Windows-only chrome: `apps/windows/src/styles/shell.css` for titlebar/sidebar glass and `data-tauri-drag-region` — not in `@pane/ui`.
- Optimize the main window for the default 800–900 px width.
- Icons: `lucide-react` in the Windows app with the `Icon` suffix (`PenIcon`, not `Pen`). Do not add other icon libraries.
- Companion dev requires a **dev client** build (`pnpm run companion` -> `expo run:ios --device`); Expo Go is not supported for native sliders/Tamagui controls.

### UI surfaces

Map layout to Pickle primitives and `--app-*` tokens in `apps/windows/src/styles/global.css`:

| Surface                               | Implementation                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Page background                       | `bg-background` on shell content                                                                     |
| Cards                                 | Pickle `Card` / `Card.Content`                                                                       |
| Inset panels, device lists            | `bg-muted` + `border-border`                                                                         |
| Section separators on muted           | `border-[var(--app-border-medium)]`                                                                  |
| Popup overlays (transparent webviews) | `--app-preview-overlay`, `--app-selection-dim` — use opaque rgb(), not `color-mix(..., transparent)` |

Shared Windows composites: `LabeledSlider`, `PageStatus`, `PageSection` in
`apps/windows/src/components/`. Button variant rules live in
`page-status.tsx`.

## Rust / Tauri guidelines

### Sync commands deadlock window creation

`async fn` is required for any command that creates, closes, or reconfigures a window. Sync commands run on the main thread; `WebviewWindowBuilder::build()` also needs the main thread — you get a silent deadlock, the window appears as `about:blank`, and all subsequent IPC hangs.

### Child window URLs

`WebviewUrl::App("index.html?view=preview".into())` drops the query string silently. Use `child_webview_url` (`apps/windows/tauri/src/child_webview_url.rs`) so every secondary webview gets a **direct frontend route path** from the main window's origin — never `?view=` on the main pathname (`/capture`):

```rust
use crate::child_webview_url::{self, routes};

let url = child_webview_url::webview_url(app, routes::CAPTURE_PREVIEW)?;
// optional query (e.g. accent chars on first paint):
let url = child_webview_url::route_url_with_query(app, routes::ACCENT_POPUP, &[("chars", "à,â,ä")])?;
```

Add new popup routes to `child_webview_url::routes` and `apps/windows/src/routes/` together. The root index route's `?view=` redirects are legacy only.

### Multi-step flows that destroy windows

Orchestrate from Rust, not JS. If JS calls `await closeWindowA()` and then `await nextStep()`, the JS context dies the moment the window closes and the rest of the chain is silently cancelled. Put the whole sequence in one `async fn` Tauri command. See `commit_region_capture` in `apps/windows/tauri/src/commands/windows.rs` for the pattern.

### `xcap::Monitor` is `!Send`

Drop the `Monitor` before any `.await`. Tauri async commands need everything held across an await to be `Send`.

### Capability manifests and generated schemas

Edit permissions in `apps/windows/tauri/capabilities/*.json` (source of truth), not by hand in `apps/windows/tauri/gen/schemas/`.

After changing any capability manifest, regenerate and **commit** the tracked output:

```powershell
pnpm run tauri:gen
git add apps/windows/tauri/gen/schemas/
```

`pnpm run tauri:gen` runs `cargo build`, which invokes `tauri_build` and refreshes `capabilities.json`, `acl-manifests.json`, and the desktop/windows schema JSON under `apps/windows/tauri/gen/schemas/`. Pre-commit runs this automatically when a staged diff touches `apps/windows/tauri/capabilities/`; CI enforces a clean tree via `pnpm run tauri:gen:check`.

### Common dev signals

- Vite web frontend: `http://localhost:8081` (see `tauri.conf.json`)
- CDP target list: `http://localhost:9222/json/version`
- `pane.exe` exit code `0xffffffff` = Rust panic. Re-run with `$env:RUST_BACKTRACE=1`.
- Port 8081 already in use: `Get-NetTCPConnection -LocalPort 8081 -State Listen` to find the owner.

## Git

Use Conventional Commits: `feat: …`, `fix: …`, `refactor: …`, etc.
