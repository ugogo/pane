# Handoff — capture preview slide-in animation (first create)

## Goal

The capture preview window (label `capture-preview`) should **slide up from below its resting position** *and* **fade in** when it first appears. On every subsequent capture (window reused) both effects should also play.

Resting position is bottom-left of the primary monitor with a 24px margin. Window is a transparent, undecorated, always-on-top 200×200 square. The image inside uses `object-contain`.

## Current state

- **Reuse path works.** When the preview is already open and a new capture happens, the user sees the window slide up + content fade.
- **First-create path is broken.** User sees only a fade — no slide. Even though `outer_position` polling from CDP *says* the window's Y coordinate is changing during the tween, the user does not perceive any motion.

## What was tried (and why it looked right under instrumentation but failed in the eye test)

The Rust side (`src-tauri/src/commands/windows.rs`, `show_capture_preview`):

1. Window is built with `.visible(false)` and `.position(pos_x, start_y)` where `start_y = pos_y + 80.0` (logical px).
2. `WebviewWindowBuilder::on_page_load(...)` listens for `PageLoadEvent::Finished`. In that callback we:
   - `window.set_position(LogicalPosition::new(pos_x, start_y))` (reassert)
   - `window.show()`
   - `spawn_slide_up(window, pos_x, start_y, pos_y)` — tween Y over ~320ms with ease-out quart via `tokio::time::sleep(16ms)` + `set_position` per frame.

CDP probe sampled `plugin:window|outer_position` every 25ms and saw:
- `t=117ms, y=1296, v=false`
- `t=156ms, y=1296, v=true` — window becomes visible at start position
- `t=243-586ms, y=1268 → 1216` — smooth tween
- 80 physical px slide over ~430ms

So `set_position` is firing and `is_visible` flips at the start of the slide. But **the user reports no perceived slide on the first create**. Reuse path's polling looks essentially identical and reuse DOES work for them visually. So polling is not a reliable proxy here.

## Hypotheses to investigate

1. **WebView2 has a first-paint delay after `show()`.** The window may be marked visible by the OS while DWM still hasn't composited any pixels. By the time the user sees a pixel, the tween is finished and the window is at rest. The reuse case avoids this because the webview is already composited and only re-renders content.
2. **`PageLoadEvent::Finished` fires before first paint.** DOM `load` is not the same as "pixels on screen." A `requestAnimationFrame` confirmation from the frontend would be a tighter signal.
3. **WebView2 / DWM applies its own fade-in animation on first show** that overrides or masks `set_position` updates issued during it.
4. **`set_position` issued during a `show()` transition may be coalesced** by the window manager — only the last value is honored before first composite, so the start position is effectively discarded.

## Suggested next steps

Try these in order — observe the result with the user (not just CDP polling) after each:

1. **Wait for the frontend's first painted frame before tweening.** In `src/views/CapturePreview.tsx`, after the initial `fetchLatest()` resolves and the component has rendered, schedule two nested `requestAnimationFrame`s and then `invoke("preview_ready")`. On the Rust side, replace the `on_page_load` hook with a one-shot listener for that command/event. Only then `show()` + tween.

2. **If hypothesis 1 holds, prefer a longer tween (e.g. ~600ms) and consider starting it with a `tokio::time::sleep(50–100ms)` after `show()`.** Gives DWM time to composite the first frame before motion starts.

3. **Bypass WebView2's native show animation.** On Windows, calling `SetWindowPos` with `SWP_NOACTIVATE | SWP_SHOWWINDOW` can skip the default fade. This requires raw `windows-rs` / `winapi` calls — Tauri's `WebviewWindow::hwnd()` returns an `HWND` you can use. Only worth trying if (1) doesn't fix it.

4. **Try animating from inside the webview using CSS** *combined with* a tall-window trick: build the OS window at the final position with the React card pinned to `bottom: 0; height: calc(100% - 80px);` so the card has 80px of empty space *above* it inside the window. Animate the card's `transform: translateY(80px) → translateY(0)` in CSS. This avoids the OS-level positional animation entirely and may be more reliable than fighting WebView2's first-paint behavior. **Caveat:** the user previously asked for the *window* to animate, not the content. But if the window is transparent and only the card is visible, the user shouldn't be able to tell the difference.

## How to drive the running app

Launch with CDP enabled:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
npm run dev
```

WebView2 exposes Chrome DevTools Protocol on port 9222. Use Node's native `fetch`/`WebSocket` (Node 22+) to hit `http://localhost:9222/json` and eval JS in the target window.

Direct Tauri command invocation from CDP:
```js
await window.__TAURI_INTERNALS__.invoke('show_capture_preview')
```

Reading window state:
```js
await window.__TAURI_INTERNALS__.invoke('plugin:window|outer_position', { label: 'capture-preview' })
// also: plugin:window|outer_size, plugin:window|is_visible
```

Closing the preview to reset:
```js
await window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'capture-preview' })
```

## Validation rule

- `cargo check` ≠ validation.
- CDP polling ≠ validation when the symptom is perceptual.
- **The user must confirm the slide is visible** before declaring the bug fixed. Ask them: "Close the existing preview, then trigger a fullscreen capture. Did the window slide up from below, or did it just fade in at the resting position?"

## Key files

- `src-tauri/src/commands/windows.rs` — `show_capture_preview`, `bottom_left_position`, `toggle_capture_preview`. **Primary target.**
- `src/views/CapturePreview.tsx` — React component. Outer div is the visible card; opacity transition is here. Listens for `refresh-capture` event from Rust.
- `src/main.tsx` — view router (`?view=preview` → `CapturePreview`).
- `src-tauri/capabilities/default.json` — permissions (includes `core:window:allow-close`).
- `src/lib/commands.ts` — TS bindings for the Rust commands.
- `AGENTS.md` — Tauri lessons learned (sync/async deadlock, URL gotcha, JS-context-death, !Send Monitor).
- `docs/2026-05-27-tauri-migration-spike.md` — Validation Protocol + checklist.

## Known constraints

- Don't break the reuse path — it works visually.
- Don't break the area-capture flow (`commit_region_capture` calls `show_capture_preview` at the end).
- Conventional Commits.
- Capture preview must remain transparent + decoration-less; user wants a clean square card with hover-revealed controls.
