# AGENTS.md

## Stack

**Pane** is a Windows desktop utility suite: **Light Controls** and
**CleanShot** in one modular hub, with more modules expected over time.

- **Frontend**: TypeScript + React + Expo Router + Tamagui (`@pane/ui`) on Windows web (Metro) and companion (React Native)
- **Backend**: Rust + Tauri 2
- **Entry point**: `apps/windows/app/` (Expo Router) -> `apps/windows/tauri/src/lib.rs`

## Running the app

```powershell
npm run dev          # stop any existing dev session, then start fresh (Tauri + Metro)
npm run stop         # kill dev without restarting
```

`npm run dev` always restarts: it stops leftover `pane.exe`, `cargo`, and Metro
processes for this repo before launching. Concurrent calls serialize via a
repo-scoped lock — the later call wins. Prefer `npm run dev` over raw
`tauri dev` or `npx expo start`.

For CDP-driven testing, set the env var before starting:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
npm run dev
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
  app bundling uses Metro (`apps/windows/metro.config.js`, `apps/mobile/metro.config.js`).
- **Warnings are errors**: lint runs with `--max-warnings 0`, so a warning
  fails the build/commit. Suppress a genuine false positive with a narrow
  `// eslint-disable-next-line <rule>` plus a one-line reason (current ones:
  the hardware-sequential DDC writes in `BrightnessCard`, and the mount fetch
  in `CapturePreview`).

```powershell
npm run lint           # eslint . --max-warnings 0
npm run lint:fix       # eslint . --fix --max-warnings 0
npm run format         # prettier --write .
npm run format:check   # prettier --check .
npm run rust:fmt       # cargo fmt
npm run rust:clippy    # cargo clippy --all-targets -- -D warnings
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

- Shared design system: [`packages/ui`](packages/ui) (`@pane/ui`) — Tamagui theme **`pane`** (tokens from desktop `global.css` / `shell.css`).
- Use `Button`, `Card`, `Switch` (`native` on mobile), `Slider` (native range / `@react-native-community/slider`), `QRCode`, layout stacks from `@pane/ui` before adding one-off primitives.
- Wrap app roots with `UIProvider`. Both apps use `@tamagui/babel-plugin` pointing at `packages/ui/tamagui.config.cjs`.
- Windows-only chrome: `apps/windows/app/shell.css` for titlebar/sidebar glass and `data-tauri-drag-region` — not in `@pane/ui`.
- Optimize the main window for the default 800–900 px width.
- Icons: `@tamagui/lucide-icons` (re-export from `@pane/ui` when needed). Do not add other icon libraries.
- Companion dev requires a **dev client** build (`npm run companion` → `expo run:ios --device`); Expo Go is not supported for native sliders/Tamagui controls.

## Rust / Tauri guidelines

### Sync commands deadlock window creation

`async fn` is required for any command that creates, closes, or reconfigures a window. Sync commands run on the main thread; `WebviewWindowBuilder::build()` also needs the main thread — you get a silent deadlock, the window appears as `about:blank`, and all subsequent IPC hangs.

### Child window URLs

`WebviewUrl::App("index.html?view=preview".into())` drops the query string silently. Use `child_webview_url` (`apps/windows/tauri/src/child_webview_url.rs`) so every secondary webview gets a **direct expo-router path** from the main window's origin — never `?view=` on the main pathname (`/capture`):

```rust
use crate::child_webview_url::{self, routes};

let url = child_webview_url::webview_url(app, routes::CAPTURE_PREVIEW)?;
// optional query (e.g. accent chars on first paint):
let url = child_webview_url::route_url_with_query(app, routes::ACCENT_POPUP, &[("chars", "à,â,ä")])?;
```

Add new popup routes to `child_webview_url::routes` and `app/(views)/` together. `app/index.tsx` `?view=` redirects are legacy only.

### Multi-step flows that destroy windows

Orchestrate from Rust, not JS. If JS calls `await closeWindowA()` and then `await nextStep()`, the JS context dies the moment the window closes and the rest of the chain is silently cancelled. Put the whole sequence in one `async fn` Tauri command. See `commit_region_capture` in `apps/windows/tauri/src/commands/windows.rs` for the pattern.

### `xcap::Monitor` is `!Send`

Drop the `Monitor` before any `.await`. Tauri async commands need everything held across an await to be `Send`.

### Capability manifests and generated schemas

Edit permissions in `apps/windows/tauri/capabilities/*.json` (source of truth), not by hand in `apps/windows/tauri/gen/schemas/`.

After changing any capability manifest, regenerate and **commit** the tracked output:

```powershell
npm run tauri:gen
git add apps/windows/tauri/gen/schemas/
```

`npm run tauri:gen` runs `cargo build`, which invokes `tauri_build` and refreshes `capabilities.json`, `acl-manifests.json`, and the desktop/windows schema JSON under `apps/windows/tauri/gen/schemas/`. Pre-commit runs this automatically when a staged diff touches `apps/windows/tauri/capabilities/`; CI enforces a clean tree via `npm run tauri:gen:check`.

### Common dev signals

- Metro web frontend: `http://localhost:8081` (Expo default; see `tauri.conf.json`)
- CDP target list: `http://localhost:9222/json/version`
- `pane.exe` exit code `0xffffffff` = Rust panic. Re-run with `$env:RUST_BACKTRACE=1`.
- Port 8081 already in use: `Get-NetTCPConnection -LocalPort 8081 -State Listen` to find the owner.

## Git

Use Conventional Commits: `feat: …`, `fix: …`, `refactor: …`, etc.
