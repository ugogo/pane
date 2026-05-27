# AGENTS.md

## Stack

This is a Windows desktop utility suite built with .NET, WinUI 3, Windows App SDK, XAML, and CommunityToolkit.Mvvm.

Primary UI projects:
- `src/Home.Hub`
- `src/Home.UI`
- `src/CleanShot.WinUI`

Shared theme resources are imported through:
- `src/Home.UI/Themes/HomeTheme.xaml`

## UI Rules

Before changing styling, inspect `HomeTheme.xaml` and nearby XAML.

Prefer existing resources:
- Brushes: use named theme brushes, not raw hex colors.
- Font sizes: use theme font resources.
- Spacing: use existing page padding, margins, and control patterns.
- Radii: use `RadiusSmall`, `RadiusMedium`, and `RadiusLarge`.

Do not introduce one-off styling unless there is no existing resource or pattern.

## Layout Rules

Avoid nesting XAML elements as much as possible. Prefer styling, reusable control templates, and shared resources over adding wrapper `Border`, `Grid`, or `StackPanel` layers for visual effects.

Use WinUI layout primitives predictably:
- `Grid` for page structure.
- `StackPanel` for simple vertical or horizontal groups.
- `ItemsRepeater`, `ListView`, or `GridView` for repeated content.
- Styles and control templates for chrome, states, and repeated visual treatment.

Text must not clip or overlap at common window sizes.

## Components

Prefer existing custom controls:
- `HubSidebar`
- `HubTextField`
- `HubNumberField`
- `HotkeyCaptureBox`
- `KnobToggleSwitch`
- `AppLogoMark`
- `AmbientGlowLayer`

If a new pattern appears more than once, create or extend a reusable control or style instead of duplicating XAML.

## Visual Direction

The app should feel like a premium Windows desktop utility:
- polished
- calm
- dense but readable
- fast to scan
- responsive and deliberate
- not like a landing page
- not overly decorative

Premium means the experience should feel carefully composed, not just functional. Use consistent spacing, clear hierarchy, restrained motion, high-quality interaction states, and controls that feel intentional.

Avoid adding hero sections, marketing copy, oversized cards, random gradients, or raw color palettes.

## Performance

Prefer fast, native-feeling interactions over implementation convenience. Keep hot paths lean, avoid unnecessary encoding/IPC/render work, and measure runtime behavior when performance matters.

## Verification

For styling changes:
- Build the solution.
- Run the relevant app when possible.
- Check light and dark theme impact if resources changed.
- Mention any UI verification that could not be performed.

## Git

Use Conventional Commits for commit messages, such as `feat: add capture delay setting` or `fix: prevent hotkey overlap`.

Do not add co-author trailers or agent attribution, including `Co-authored-by` lines.

## Working on the Tauri spike (`src/` + `src-tauri/`)

The Tauri 2 migration spike has caused multi-hour debug loops. The rules below capture lessons learned the hard way — do not skip them.

### Validate at runtime, never on compile success

A `cargo check` pass is not a validation. Per `docs/tauri-migration-spike.md`'s Validation Protocol, every checklist tick requires observed behavior in the running app. Before saying a feature works:

1. Launch the app (`npm run dev` at the repo root).
2. Drive the actual feature — click the button, fire the hotkey, watch the window.
3. Read the result with your own eyes (CDP eval, screenshot, log line — not "the code looks right").

If you can't drive it, say so and ask the user to drive it. Do not handoff with "should work."

### Driving the running Tauri app from outside

Set up once per session:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
npm run dev
```

WebView2 exposes Chrome DevTools Protocol on 9222. Use `.claude/cdp.mjs` (already in the repo) to run `Runtime.evaluate` against the main window, and `.claude/cdp-target.mjs` to target child windows by URL substring (`?view=preview`, `?view=area-selector`). Node 22+ has native `WebSocket` and `fetch` — no `ws` dependency.

Route a single `index.html` to multiple Tauri windows via `?view=` query and switch in `main.tsx`.

### Frontend icons

When the Tauri React UI needs icons, use `lucide-react`. Do not hand-roll inline SVG icons or introduce another icon library unless `lucide-react` cannot provide the needed symbol.

### Tauri 2 command sync/async — the deadlock trap

**Sync `fn` commands run on the main thread.** Any command that touches the window system (`WebviewWindowBuilder::build()`, `window.close()`, etc.) needs the main thread to process its internal messages. A sync command that creates a window deadlocks the event loop:
- The new window appears in CDP as `about:blank` and never navigates.
- All subsequent IPC calls hang silently.
- `eprintln!` before the build call still fires, so logs are misleading.

Rule: **any command that creates, closes, or reconfigures a window must be `async fn`.**

### Tauri 2 URL gotcha

`WebviewUrl::App("index.html?view=preview".into())` silently drops the query string and the window loads `about:blank`. To open a child window at a routed URL, build a `WebviewUrl::External` from the main window's current URL:

```rust
let mut url = app.get_webview_window("main").unwrap().url()?;
url.set_query(Some("view=preview"));
WebviewUrl::External(url)
```

### Don't tear down a webview while awaiting from inside it

If JS in window A calls `await closeWindowA()` then `await captureRegion()` then `await showPreview()`, the JS context dies the moment `closeWindowA` resolves — the rest of the chain is silently cancelled. Orchestrate multi-step flows that destroy windows from **Rust** (one async command that owns the whole sequence). See `commit_region_capture` for the pattern.

### `xcap::Monitor` is `!Send`

Hold the `Monitor` in a scoped block and drop it before any `.await`. Tauri's `async fn` commands need everything held across an `.await` to be `Send`.

### Don't sit on a silent script

If a tool call produces no output within a few seconds, that's a signal something is wrong — not a reason to wait longer. Specifically:

- **Hard-timeout every external probe.** `.claude/cdp.mjs` exits with code 4 after 5s rather than hanging. Copy that pattern for any new helper.
- **Don't poll with `until grep -qE …`** against `tauri dev` output. The stream is full of ANSI colour escapes (e.g. `\x1b[1m\x1b[92m    Running\x1b[0m`) and naive regexes will never match, leaving you sleeping until timeout. Poll a real signal instead — `curl http://localhost:9222/json/version` once CDP is up, or `curl http://localhost:1420` once Vite is up.
- **A silent timeout from CDP means Tauri IPC is wedged.** Plain DOM eval still works in that state, so use it to diagnose without restarting the app. The usual culprit is rule "Tauri 2 command sync/async" above.

### Common port and process state

- Vite dev server: `127.0.0.1:1420`. If `port already in use`, `Get-NetTCPConnection -LocalPort 1420 -State Listen` finds the owner. Stale `home.exe` + WebView2 children often outlive a killed dev session.
- Use `Get-CimInstance Win32_Process -Filter "ProcessId = N"` for read-only inspection — `Get-Process -Id` can trip the auto-mode classifier into thinking you're about to kill the process.
- `home.exe` exit code `0xffffffff` in the dev log means a Rust panic in window/builder code. Re-run with `$env:RUST_BACKTRACE = "1"` for a real stack trace.
