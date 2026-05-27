# Phase 3 debug plan

## Symptom
After clicking "Trigger now" for fullscreen capture:
- `capture_fullscreen` invoke command returns successfully (status badge → `pass`)
- A second CDP target appears alongside the main window
- That target has `url: "about:blank"`, `title: "about:blank"` — even though we passed `.title("Capture · http://localhost:1420/?view=preview")` to the builder

## What that means
Either (a) the preview window IS the about:blank target and its URL never loaded,
or (b) the about:blank target is something else entirely and the preview window is missing.

## Steps (in order — stop and re-plan if a step contradicts prior assumptions)

### Step 1 — Enumerate Tauri webview windows
From the main window via CDP, call `getAllWebviewWindows()` and dump labels + URLs.
- If we see `["main", "capture-preview"]` → window exists in Tauri, content didn't load (case a)
- If we see only `["main"]` → window creation was rolled back (case b)

### Step 2 — Inspect the preview window's URL from Tauri
Call `.url()` on the WebviewWindow reference. Compare to what we passed.

### Step 3 — Watch the load lifecycle
Use Tauri's `on_page_load` or `tauri://error` event to see whether navigation was attempted and failed.

### Step 4 — Try alternate URL forms
- `WebviewUrl::External(Url::parse("http://localhost:1420/?view=preview").unwrap())` — already tried, lands on about:blank
- `WebviewUrl::App("./?view=preview".into())` — relative path with query
- `WebviewUrl::App("index.html?view=preview".into())` — original, dropped query
- Try setting URL via `.initialization_script` + `window.location` instead of builder URL

### Step 5 — Compare to Tauri 2 multi-window examples online or in repo

## Instrumentation
- Wrote `.claude/cdp.mjs` — runs `Runtime.evaluate` on the localhost:1420 page
- Started Tauri dev with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`
- Added `eprintln!` in `show_capture_preview` (already shows correct URL is being passed)

## Findings log
- [Step 0] eprintln confirms the URL passed to builder is correct
- [Step 0] `.title(...)` value never reaches CDP target list (still shows "about:blank")
- [Step 1] `getAllWebviewWindows()` and even `get_process_metrics` hang after the first capture click — IPC is wedged
- **ROOT CAUSE**: `show_capture_preview` was a **sync** Tauri command. In Tauri 2, sync commands run on the main thread; `WebviewWindowBuilder::build()` then waits for main-thread work, deadlocking the event loop. The webview was created (visible in CDP) but URL navigation never executed.
- **FIX**: declared `show_capture_preview`, `show_area_selector`, `close_area_selector` as `async fn`. After the fix: preview opens with the correct URL (`http://localhost:1420/?view=preview`), shows the 2560×1440 PNG, IPC stays responsive.
- [Step 2] Drag-select in area-selector worked once, but the resulting preview kept showing 2560×1440 (the previous fullscreen image). Root cause: `closeAreaSelector` from JS killed the area-selector webview's JS context before the chained `captureRegion` + `showCapturePreview` invokes ran. The race left the selector closed but the new capture never executed.
- **FIX**: introduced `commit_region_capture` — a single async Rust command that closes the overlay, captures, stores in state, and opens the preview. AreaSelector.tsx now calls only that. End-to-end: drag (200,200)→(700,500) produces a 500×300 PNG in the preview, exactly as expected.
