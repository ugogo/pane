# Tauri Migration Feasibility Spike

> **Branch:** `codex/tauri-feasibility-spike`  
> **Spike location:** `experiments/home-tauri/`  
> **Started:** 2026-05-27  
> **Status:** In progress — decision pending

---

## Validation Protocol

> **This section is mandatory reading for any agent working on this spike.**

A checklist item may only be ticked once the behaviour has been **observed at runtime**, not just because the code compiles or a command is wired up.

### Rules

1. **Build and run first.** Before touching any checklist item, run `npm run tauri:spike:dev` and confirm the app window appears. A compile error or blank screen must be fixed before any item is marked.

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

## Architecture of the Spike

```
experiments/home-tauri/
├── src/                         # React + TypeScript frontend
│   ├── components/features/     # Probe cards (one per capability)
│   └── lib/commands.ts          # Typed invoke() wrappers for all Rust commands
└── src-tauri/
    ├── src/
    │   ├── main.rs              # Entry point → runs lib
    │   ├── tray.rs              # System tray icon + menu
    │   └── commands/
    │       ├── status.rs        # App info probe
    │       ├── startup.rs       # Windows registry run-at-startup
    │       ├── capture.rs       # Fullscreen + region screen capture
    │       ├── devices.rs       # HID device enumeration
    │       ├── openrgb.rs       # TCP probe for OpenRGB SDK
    │       ├── hotkeys.rs       # Global hotkey registration
    │       └── settings.rs      # Persistent prototype settings
    └── Cargo.toml               # Rust deps: tauri 2.x, hidapi, screenshots, winreg…
```

### Running the spike

```powershell
# Install Rust + MSVC build tools (first time only)
npm run tauri:prereqs

# Dev mode (hot-reload frontend + Rust backend)
npm run tauri:spike:dev

# Production build
npm run tauri:spike:build
```

---

## Checklist

Each item below is a capability the production app depends on.  
`✅` = probed and confirmed working in the spike  
`🔲` = not yet tested  
`⚠️` = partially tested or known risk  
`❌` = confirmed blocker

### Core infrastructure

- [ ] 🔲 Tauri 2 project scaffolded and builds on Windows
- [ ] 🔲 Rust ↔ TypeScript IPC (`invoke`) is working end-to-end
- [ ] 🔲 System tray icon with context menu (Show / Quit)
- [ ] 🔲 Left-click tray → show main window
- [ ] 🔲 App startup registry entry (`HKCU\…\Run`) via `winreg`
- [ ] 🔲 Single-instance enforcement (`tauri-plugin-single-instance`)
- [ ] 🔲 App auto-updater (`tauri-plugin-updater`) — update check + silent install
- [ ] 🔲 Windows installer (NSIS or WiX) produced by `tauri build`
- [ ] 🔲 App icon embedded in `.exe` and taskbar

### Screen capture (CleanShot)

- [ ] 🔲 Fullscreen capture via `screenshots` crate — PNG returned as base64 data URL
- [ ] 🔲 Region capture with `capture_area(x, y, w, h)`
- [ ] ⚠️ **Transparent overlay window for region selection** ← _primary migration risk_
  - WinUI uses a full-screen `RegionSelectorWindow` with click-through hit-testing
  - Tauri can create transparent windows, but the interaction model needs validation
  - Must verify: transparent + always-on-top + mouse capture works without focus stealing
- [ ] 🔲 CleanShot-style annotation toolbar after capture
- [ ] 🔲 Clipboard integration — writing a PNG to the Windows clipboard from Rust
- [ ] 🔲 Multi-display capture (correct DPI handling on mixed-DPI setups)
- [ ] 🔲 Screen recording / GIF (not currently a Tauri crate — may need FFmpeg subprocess)

### Global hotkeys

- [ ] 🔲 `tauri-plugin-global-shortcut` registers hotkeys
- [ ] 🔲 Hotkeys survive window minimise / hide to tray
- [ ] 🔲 Hotkey fires the capture flow end-to-end (not just a command return)
- [ ] 🔲 Hotkey conflict detection (another app already holds the combo)

### RGB lighting (LightControls)

- [ ] 🔲 HID device enumeration via `hidapi` crate
- [ ] 🔲 OpenRGB TCP endpoint probe (connect + check reachable)
- [ ] 🔲 Full OpenRGB protocol (set device color, get device list) — currently only TCP probe
- [ ] 🔲 Logitech direct HID protocol (HID++ 2.0) — raw HID writes from Rust
- [ ] 🔲 DxLight direct HID — verify hidapi can open exclusive handles on Windows
- [ ] 🔲 Color apply round-trip (UI → Rust command → device)

### Settings persistence

- [ ] 🔲 `read_hub_settings` / `write_prototype_settings` Rust commands defined
- [ ] 🔲 Settings actually persisted to disk (JSON file in `%APPDATA%`)
- [ ] 🔲 Settings survive app restart

### Window management

- [ ] 🔲 Hide to tray (window close → hide, not exit)
- [ ] 🔲 Restore from tray without taskbar flash
- [ ] 🔲 Multiple windows open simultaneously (hub + capture overlay)
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

- [ ] 🔲 `metrics` Rust command returns working set + startup elapsed time
- [ ] 🔲 `MetricsCard` probe panel in the dashboard with live auto-refresh
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

1. **Add the instrumentation module first** — `commands/metrics.rs` + `MetricsCard.tsx` per the spec above. This must be done before validating any other checklist item, because RAM and startup time need to be on screen during every subsequent test session. Follow the Validation Protocol: run the app, confirm the card appears at the top of the grid, and verify numbers update on auto-refresh before moving on.
2. **Capture WinUI 3 baseline numbers** — with the metrics card live, run the PowerShell snippets above while the current WinUI app is idle; record both sets of numbers in a new `## Results` section.
3. **Build and run the full spike** — `npm run tauri:spike:dev`, walk through every probe card top to bottom, and tick items per the Validation Protocol.
4. **Implement and test the overlay window probe** — most important unknown; test rubber-band region selection end-to-end. Prompt the user to confirm the overlay renders correctly on their display.
5. **Clipboard probe** — add a `copy_png_to_clipboard` Rust command and verify paste works in an external app.
6. **Full HID write probe** — attempt an actual color-set command to a Logitech device. Prompt the user to confirm the LED changes.
7. **Document results** in this file under a new `## Results` section.
8. **Call the decision** using the go/no-go table above.
