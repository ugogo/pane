# AGENTS.md

## Stack

**Pane** is a Windows desktop utility suite: **Light Controls** and
**CleanShot** in one modular hub, with more modules expected over time.

- **Frontend**: TypeScript + React + Tailwind (Vite)
- **Backend**: Rust + Tauri 2
- **Entry point**: `src/App.tsx` -> `src-tauri/src/lib.rs`

## Running the app

```powershell
npm run dev          # full Tauri dev (Vite frontend + Rust backend)
npm run stop         # kill stuck dev instances
```

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

- **Frontend**: ESLint (flat config, `eslint.config.js`) + Prettier (`.prettierrc.json`).
- **Rust**: rustfmt (`src-tauri/rustfmt.toml`) + clippy (`-D warnings`).

```powershell
npm run lint           # eslint .
npm run lint:fix       # eslint . --fix
npm run format         # prettier --write .
npm run format:check   # prettier --check .
npm run rust:fmt       # cargo fmt
npm run rust:clippy    # cargo clippy --all-targets -- -D warnings
```

- **Format on save**: `.vscode/settings.json` enables format-on-save (Prettier
  for web assets, rustfmt for Rust) plus ESLint autofix. Install the
  recommended extensions when VS Code prompts.
- **Agents**: a `PostToolUse` hook (`.claude/settings.json` →
  `scripts/format-file.mjs`) formats every file an agent writes, so agent edits
  match save-on-format output without a manual pass.
- **Pre-commit**: husky + lint-staged run Prettier + ESLint `--fix` on staged
  JS/TS and rustfmt on staged Rust; clippy runs when any Rust file is staged.
- **CI** re-checks `lint`, `format:check`, `cargo fmt --check`, and clippy.
- The React-Compiler lints (`set-state-in-effect`, `static-components`) are
  **warnings**, not errors — they flag valid existing patterns. Tighten to
  errors per component as they're migrated.

## UI Guidelines

- Icons: use `lucide-react`. Do not hand-roll inline SVGs or add other icon libraries.
- Styling: Tailwind utility classes (Tailwind v4, CSS-first config). Check the `@theme` block in `src/styles.css` for custom tokens before reaching for raw values.

## Rust / Tauri guidelines

### Sync commands deadlock window creation

`async fn` is required for any command that creates, closes, or reconfigures a window. Sync commands run on the main thread; `WebviewWindowBuilder::build()` also needs the main thread — you get a silent deadlock, the window appears as `about:blank`, and all subsequent IPC hangs.

### Child window URLs

`WebviewUrl::App("index.html?view=preview".into())` drops the query string silently. Build a `WebviewUrl::External` from the main window's current URL instead:

```rust
let mut url = app.get_webview_window("main").unwrap().url()?;
url.set_query(Some("view=preview"));
WebviewUrl::External(url)
```

### Multi-step flows that destroy windows

Orchestrate from Rust, not JS. If JS calls `await closeWindowA()` and then `await nextStep()`, the JS context dies the moment the window closes and the rest of the chain is silently cancelled. Put the whole sequence in one `async fn` Tauri command. See `commit_region_capture` in `src-tauri/src/commands/windows.rs` for the pattern.

### `xcap::Monitor` is `!Send`

Drop the `Monitor` before any `.await`. Tauri async commands need everything held across an await to be `Send`.

### Common dev signals

- Vite frontend: `http://localhost:1420`
- CDP target list: `http://localhost:9222/json/version`
- `pane.exe` exit code `0xffffffff` = Rust panic. Re-run with `$env:RUST_BACKTRACE=1`.
- Port 1420 already in use: `Get-NetTCPConnection -LocalPort 1420 -State Listen` to find the owner.

## Git

Use Conventional Commits: `feat: …`, `fix: …`, `refactor: …`, etc.
