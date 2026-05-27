# Tauri Migration Feasibility Spike

> **Branch:** `codex/tauri-feasibility-spike`  
> **Spike location:** `src/` (React frontend + `src-tauri/` Rust backend)  
> **Started:** 2026-05-27  
> **Status:** In progress — capture + hotkeys validated; Phase 3 (HID/lighting) and packaging open

---

## Validation Protocol

> **This section is mandatory reading for any agent working on this spike.**

A checklist item may only be ticked once the behaviour has been **observed at runtime**, not just because the code compiles or a command is wired up.

### Rules

1. **Build and run first.** Before touching any checklist item, run `npm run dev` and confirm the app window appears. A compile error or blank screen must be fixed before any item is marked.

2. **Test step by step.** For each item being validated, interact with the relevant UI control or trigger the relevant action in the running app. Read the actual output (probe card result, console, tray behaviour, etc.). Do not infer from source code alone.

3. **Prompt the user when needed.** Some probes require physical hardware (HID devices, OpenRGB server) or a specific environment (second monitor, another app holding a hotkey). In those cases, **ask the user to perform the action or confirm the result** before marking the item. It is always acceptable to pause and ask rather than guess.

   Examples of when to prompt:
   - "Can you click the tray icon and confirm the window appears?"
   - "Is your Logitech mouse plugged in? I'll now run the HID write probe."
   - "The OpenRGB probe returned reachable — does the device LED actually change colour?"

4. **Mark the status emoji correctly.**
   - `✅` — confirmed working by direct observation or user confirmation
   - `⚠️` — works but with caveats noted inline
   - `❌` — confirmed broken; add a one-line note with what failed

5. **Record findings inline.** When a test reveals anything unexpected — a workaround needed, a caveat, a driver quirk — add a short note directly under the checklist item. Do not leave it only in your session transcript.

---

## Why We Are Doing This

Home is currently built on **.NET 10 + WinUI 3**. While this stack works, it comes with a set of long-term costs and constraints:

| Pain point | Impact |
|---|---|
| WinUI 3 / XAML tooling is Windows-only | Blocks any future cross-platform expansion |
| C# + XAML split means two mental models | Slower UI iteration |
| WinUI 3 designer support is poor | Styling and layout changes are slow |
| App packaging (MSIX) is brittle and heavyweight | Distribution friction |
| Limited ecosystem for modern UI patterns | Hard to reuse web design systems (ShadCN, Tailwind) |

**Tauri** is a compelling alternative: a **Rust** backend paired with a **web frontend** (React + TypeScript + Tailwind). Benefits:

- Rust gives us comparable or better native access (HID, registry, screen capture, global hotkeys)
- The frontend stack is already in use on the hub dashboard (Vite + React + Tailwind)
- Tauri bundles to a small `.exe` + installer with no MSIX ceremony
- Cross-platform is free if we ever target macOS or Linux
- The IPC model (`invoke`) is clean and type-safe when paired with TypeScript bindings

The spike goal is **not to rewrite the app** — it is to answer: *can Tauri faithfully replicate every behaviour the current WinUI app relies on, especially the hard parts?*

---

## Architecture

The WinUI 3 / C# implementation is preserved in `src-legacy/` for reference.
The new Tauri app lives in `src/` and is built up incrementally, one phase at a time.

```
src/
├── src/                         # React + TypeScript frontend
│   ├── App.tsx                  # Probe grid — MetricsCard is always first
│   ├── components/features/     # One component per probe area
│   └── lib/commands.ts          # Typed invoke() wrappers for all Rust commands
└── src-tauri/
    ├── tauri.conf.json
    ├── capabilities/default.json
    └── src/
        ├── main.rs              # Entry point → runs lib
        ├── lib.rs               # Tauri builder + managed state
        └── commands/
            ├── mod.rs
            ├── metrics.rs       # Phase 1: process metrics (RAM + startup time)
            ├── startup.rs       # Phase 2: run-at-startup registry toggle
            ├── capture.rs       # Screen capture, clipboard, save-to-desktop
            ├── capture_sound.rs # Shutter WAV feedback on capture
            ├── hotkeys.rs       # Global shortcuts + persistence
            └── windows.rs       # Overlay, preview, area-selector windows
```

### Running

```powershell
# Install Rust + MSVC build tools (first time only)
npm run prereqs

# Dev mode (hot-reload frontend + Rust backend)
npm run dev

# Production build
npm run build
```

---

## Checklist

Each item below is a capability the production app depends on.  
`✅` = probed and confirmed working in the running app  
`🔲` = not yet tested  
`⚠️` = partially tested or known risk  
`❌` = confirmed blocker

### Phase 1 — Instrumentation

- [x] ✅ `npm run dev` — app window appears, no compile errors
- [x] ✅ `MetricsCard` renders first, full-width, above all other content
- [x] ✅ Working set (MB) and startup elapsed (ms) show real numbers
- [x] ✅ Auto-refresh updates values every ~2 s
- [x] ✅ "Refresh now" button triggers an immediate update
- [x] ✅ RAM > 300 MB colours the card `fail`; < 150 MB colours it `pass`
- [x] ✅ Sparkline grows with each sample

### Phase 2 — Core infrastructure

- [x] ✅ System tray icon with context menu (Show / Quit)
- [x] ✅ Left-click tray → show main window
- [x] ✅ Close button hides window to tray — `home.exe` stays resident
- [x] ✅ Single-instance enforcement — second launch focuses existing window
- [x] ✅ Run-at-startup toggle writes/removes `HKCU\…\Run\Home` via `winreg`
  - ⚠️ Dev build writes the debug exe path; production installer will overwrite with the installed path
- [ ] 🔲 App auto-updater (`tauri-plugin-updater`) — update check + silent install
- [ ] 🔲 Windows installer (NSIS or WiX) produced by `tauri build`
- [ ] 🔲 App icon embedded in `.exe` and taskbar

### Screen capture (CleanShot)

- [x] ✅ Fullscreen capture via `xcap` crate — PNG returned as base64 data URL (driven via CDP `invoke('capture_fullscreen')`, returns 2560×1440 image on the test rig)
- [x] ✅ Region capture with `capture_region(x, y, w, h)` (drag (200,200)→(700,500) in the overlay produced a 500×300 PNG)
- [x] ✅ **Transparent overlay window for region selection** — centred, transparent (`body bg rgba(0,0,0,0)`), always-on-top, crosshair cursor. Window is half monitor width × (half height − 50px). Rubber-band selection works; closes via `commit_region_capture` Rust command (single async cmd that closes overlay → captures → opens preview, so the overlay webview's JS death can't cancel the chain).
  - ⚠️ Two implementation gotchas worth recording:
    1. **Sync commands deadlock window creation.** `show_capture_preview` was a sync `fn` — sync commands run on the main thread, so `WebviewWindowBuilder::build()` (which needs the main thread) deadlocked. The window appeared in CDP as `about:blank` and IPC wedged. Fix: declare these commands `async fn`.
    2. **`WebviewUrl::App("…?view=…")` drops the query string.** Switched to building a `WebviewUrl::External` from the main window's current URL.
- [ ] 🔲 CleanShot-style annotation toolbar after capture
- [x] ✅ Clipboard integration — `copy_latest_capture_to_clipboard` via `arboard`; CDP invoke after `capture_fullscreen`, then Windows clipboard read back 2560×1440 PNG
- [x] ✅ Save capture to desktop — `save_latest_capture_to_desktop` writes `home-capture-<ts>.png` to the user's Desktop folder
- [x] ✅ Preview window copy/save actions — hover overlay buttons in `CapturePreview.tsx` call the Rust commands above
- [x] ✅ Capture shutter sound — `capture-shutter.wav` via `PlaySoundW` (async) on fullscreen and region capture; matches CleanShot.WinUI
- [ ] 🔲 Multi-display capture (correct DPI handling on mixed-DPI setups)
- [ ] 🔲 Screen recording / GIF (not currently a Tauri crate — may need FFmpeg subprocess)
- [x] ✅ Floating preview window after capture — `always_on_top: true`, undecorated, draggable title bar, sized to fit aspect ratio (verified: `isAlwaysOnTop()` returns true on the `capture-preview` window).
  - ⚠️ First-create slide-in animation still inconsistent — see `.claude/handoff-preview-slide.md`. Reuse path and CSS card slide work; OS-level first-show tween may be masked by WebView2 first-paint delay.

### Global hotkeys

- [x] ✅ `tauri-plugin-global-shortcut` registers hotkeys (`set_capture_hotkey({ action, accelerator })` round-trips through Rust, stored in a `Lazy<Mutex<HashMap>>`)
- [x] ✅ Capture hotkeys persist to `%APPDATA%\dev.home.app\capture-hotkeys.json` and restore on launch via `restore_capture_hotkeys` in `setup`
  - ⚠️ Accelerator strings are canonicalized through `Shortcut::from_str` before entering the binding map (`fix(hotkeys): canonicalize accelerators`)
- [x] ✅ Hotkeys survive window minimise / hide to tray — user confirmed `Alt+Shift+3` fires capture while hub stays hidden; orchestration moved to Rust (`dispatch_hotkey_capture`), no `main.show()`
- [x] ✅ Hotkey fires the capture flow end-to-end — shutter sound + floating preview confirmed from tray-hidden state
- [ ] 🔲 Hotkey conflict detection (another app already holds the combo)

### RGB lighting (LightControls)

- [ ] 🔲 HID device enumeration via `hidapi` crate
- [ ] 🔲 OpenRGB TCP endpoint probe (connect + check reachable)
- [ ] 🔲 Full OpenRGB protocol (set device color, get device list) — currently only TCP probe
- [ ] 🔲 Logitech direct HID protocol (HID++ 2.0) — raw HID writes from Rust
- [ ] 🔲 DxLight direct HID — verify hidapi can open exclusive handles on Windows
- [ ] 🔲 Color apply round-trip (UI → Rust command → device)

### Settings persistence

- [x] ✅ Capture hotkeys persisted to disk and survive restart (`capture-hotkeys.json` in app config dir)
- [ ] 🔲 `read_hub_settings` / `write_prototype_settings` Rust commands defined
- [ ] 🔲 Hub settings persisted to disk (JSON file in `%APPDATA%`)
- [ ] 🔲 Hub settings survive app restart

### Window management

- [x] ✅ Hide to tray (window close → hide, not exit) — verified in Phase 2; `home.exe` stays resident
- [x] ✅ Restore from tray — left-click tray icon shows main window (verified in Phase 2)
  - ⚠️ Taskbar flash on restore not explicitly measured
- [x] ✅ Multiple windows open simultaneously — main + `area-selector` + `capture-preview` validated end-to-end during region capture (`commit_region_capture`)
- [ ] 🔲 Window position and size remembered across restarts

### Developer experience

- [ ] 🔲 Rust compile time on a cold build is acceptable (< 3 min)
- [ ] 🔲 Hot-reload round-trip time for UI changes feels fast
- [ ] 🔲 Source maps work in dev tools for debugging

### Performance

- [ ] 🔲 Cold startup time vs current WinUI app (target: ≤ WinUI, ideally faster)
- [ ] 🔲 Idle RAM usage vs WinUI app
- [ ] 🔲 Bundle size of the installer vs current MSIX

### Instrumentation

- [x] ✅ `get_process_metrics` Rust command returns working set + startup elapsed time — see Phase 1
- [x] ✅ `MetricsCard` probe panel in the dashboard with live auto-refresh — see Phase 1
- [ ] 🔲 WinUI baseline numbers captured and recorded in Results section

---

## Instrumentation Module

Performance numbers are a first-class deliverable of this spike — without them the go/no-go criteria for RAM and startup time (rows 6 and 7 in the table below) cannot be answered. This section specifies what to build and how to measure.

### What to measure

| Metric | Why it matters |
|---|---|
| **Working set (RAM)** | WebView2 embeds Chromium; primary concern is idle memory vs WinUI 3 |
| **Virtual memory committed** | Complements working set; reveals hidden allocations |
| **Startup elapsed (ms)** | Rust `main()` → first IPC response — includes WebView2 spin-up |
| **Time to interactive (ms)** | Frontend `useEffect` fires → user can interact; perceived launch speed |
| **Bundle size (MB)** | `tauri build` output vs current MSIX |

### Rust side — `commands/metrics.rs`

A single `get_process_metrics` command, callable from the frontend at any time:

- Capture a `std::time::Instant` at the very top of `run()` in `lib.rs` (before the Tauri builder starts) and store it as Tauri app state via `.manage(StartTime(instant))`.
- Inside the command, call `sysinfo::System::refresh_process(pid)` to snapshot current RAM — no background thread needed.
- Return: `pid`, `startupElapsedMs`, `workingSetBytes`, `workingSetMb`, `virtualMemoryBytes`, `virtualMemoryMb`.
- Crate to add: `sysinfo = { version = "0.30", default-features = false, features = ["system"] }`.

```
src-tauri/src/commands/metrics.rs   ← new file
src-tauri/src/lib.rs                ← add .manage(StartTime(Instant::now()))
                                       add get_process_metrics to invoke_handler
src-tauri/src/commands/mod.rs       ← pub mod metrics;
src-tauri/Cargo.toml                ← sysinfo dependency
```

### Frontend side — `MetricsCard.tsx`

A probe card added to the dashboard grid that:

- Calls `getProcessMetrics()` on mount and every 2 seconds (togglable auto-refresh).
- Displays: PID, startup elapsed, working set (MB), virtual memory (MB).
- Colours the card status based on RAM: `pass` < 150 MB · `warn` 150–300 MB · `fail` > 300 MB.
- Keeps a rolling history of the last 30 RAM readings and renders a minimal sparkline (flex bar chart, no library needed) so memory growth over time is visible at a glance.

**Placement:** `MetricsCard` must be the **first card rendered in the probe grid**, above all other probes. It spans the full grid width (`lg:col-span-2`) so numbers are immediately visible as soon as the app opens — without scrolling. The intent is that every test session starts with RAM and startup time already on screen.

```
src/components/features/MetricsCard.tsx   ← new file
src/lib/commands.ts                       ← ProcessMetrics interface + getProcessMetrics()
src/App.tsx                               ← <MetricsCard /> as first child of the probe grid,
                                             full-width (col-span-2), before all other cards
```

### WinUI 3 baseline

Before calling the migration decision, capture equivalent numbers from the current app:

```powershell
# Working set of the running WinUI process (MB)
Get-Process -Name "Home*" | Select-Object Name, @{n="RAM_MB";e={[math]::Round($_.WorkingSet64/1MB,1)}}

# Startup time — measure wall-clock from launch to first window visible
Measure-Command { Start-Process ".\path\to\Home.exe" -Wait }
```

Record both sets of numbers in the **Results** section below once collected.

---

## Go / No-Go Criteria

At the end of the spike, answer these questions. **All "go" answers → proceed with migration. Any "no-go" → document the blocker and either find a workaround or stay on WinUI 3.**

### Must-pass (blockers)

| # | Question | Go | No-go |
|---|---|---|---|
| 1 | Can Tauri render a transparent always-on-top region-selector overlay with working mouse capture? | Confirmed working | Any visual glitch, Z-order issue, or cursor bleed-through |
| 2 | Can we write a captured PNG to the Windows clipboard from Rust? | Works without a C# interop shim | Requires native clipboard DLL / unacceptable hack |
| 3 | Can `hidapi` open exclusive HID handles to Logitech + DxLight devices (not blocked by Windows security)? | Handles open and writes succeed | Devices refuse connection or require admin |
| 4 | Can global hotkeys fire the capture pipeline when the app window is hidden? | Hotkey → capture → tray notification works | Hotkeys die when window is hidden |
| 5 | Is the installer produced by `tauri build` a clean self-contained `.exe`? | Silent install, no MS Store, no MSIX | Forces MSIX or MS Store |

### Should-pass (strong preferences)

| # | Question | Go | No-go |
|---|---|---|---|
| 6 | Is cold startup time ≤ current WinUI app? | Comparable or faster | > 2× slower |
| 7 | Is idle RAM ≤ current WinUI app? | Comparable or lower | > 2× higher (WebView2 overhead) |
| 8 | Can the auto-updater deliver silent background updates? | Works with a simple GitHub releases endpoint | Requires a custom update server to build and maintain |
| 9 | Is the Rust compile time on CI acceptable? | < 5 min incremental | > 10 min even incremental |

### Nice-to-have (not blockers)

- Screen recording / GIF capture is achievable (even via FFmpeg subprocess)
- DX and DPI handling on mixed-DPI multi-monitor setups is correct first try
- Dev tooling (hot reload, source maps) matches current TypeScript experience

---

## Known Risks

1. **CleanShot overlay** — the current WinUI `RegionSelectorWindow` relies on `WindowStyle = None`, `AllowsTransparency`, and WM_NCHITTEST. Tauri's transparent window support is via WebView2 and has known edge cases on some GPU drivers.
2. **WebView2 memory** — Tauri on Windows embeds Chromium (WebView2). Idle memory will be higher than a pure WinUI app. Acceptable only if the total stays under ~150 MB.
3. **HID exclusive access** — Windows 10/11 restricts raw HID writes on some devices. The `hidapi` crate uses `CreateFile` with `SHARE_READ | SHARE_WRITE`; some mice reject this.
4. **Rust learning curve** — the backend team is C# today. Budget ramp-up time before velocity returns to baseline.

---

## Next Steps

1. ~~**Add the instrumentation module first**~~ — done (Phase 1).
2. **Capture WinUI 3 baseline numbers** — with the metrics card live, run the PowerShell snippets above while the current WinUI app is idle; record both sets in a new `## Results` section.
3. ~~**Overlay window probe**~~ — done; region selection + preview chain validated.
4. ~~**Clipboard probe**~~ — done; `copy_latest_capture_to_clipboard` confirmed via CDP + Windows clipboard read-back.
5. ~~**Physical hotkey test while hidden**~~ — done; hub stays in tray, capture + preview + shutter sound confirmed.
6. **Fix first-create preview slide** — follow `.claude/handoff-preview-slide.md`; user eye-test required.
7. **Phase 3 — HID / lighting probes** — `hidapi` enumeration, OpenRGB TCP, Logitech HID++ write; add `LightingCard` probe panel.
8. **Capture WinUI 3 baseline numbers** — record in `## Results` for go/no-go rows 6–7.
9. **Packaging probe** — `npm run build`, verify installer output and embedded icon.
10. **Document results** in this file under a new `## Results` section.
11. **Call the decision** using the go/no-go table above.
