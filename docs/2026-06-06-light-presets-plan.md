---
title: Light Control Presets Plan
type: plan
status: shipped
created: 2026-06-06
updated: 2026-06-28
---

# Light Control Presets Plan

## Summary

Add reusable presets for the Lights module so users can save and apply named
lighting scenes across Windows Dynamic Lighting devices, the MSI motherboard
headers, and the DX Light strip.

This is separate from the existing DDC/CI monitor presets in Display. Display
presets store monitor brightness, contrast, and RGB gain. Light presets store
lighting hardware targets: color, brightness, and on/off intent per light.

## Shipped Status

The Windows implementation is shipped. The Lights route can load, save, apply,
update, and delete presets through the Tauri light-preset commands. Companion
snapshot support remains a separate future enhancement if mobile preset
application becomes part of a later release.

## Goals

- Save the current Lights page state as a named preset.
- Apply a preset to every matching connected light, with per-device best-effort
  error reporting.
- Update and delete presets without hand-editing JSON.
- Keep presets scoped to the app identifier so dev and prod do not share state.
- Reuse the same apply functions that the existing Lights page and companion
  commands already call.

## Non-goals

- Animated effects, gradients, or per-zone choreography.
- Cloud sync.
- Import/export.
- Replacing the existing sleep/wake restore behavior.

## Delivery Approach

| Slice | Scope                                                                                                                 | Status     |
| ----- | --------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1     | Add Rust persistence for `light-presets.json` under `app_config_dir` and Tauri commands to list/save/delete presets.  | Shipped    |
| 2     | Add an apply command that resolves each target light and writes color/brightness/off through existing light services. | Shipped    |
| 3     | Add a compact preset bar to `apps/windows/src/routes/lights.tsx`.                                                     | Shipped    |
| 4     | Add companion snapshot support if mobile preset application should include light presets.                             | Future opt |

## Data Model

Store presets as an ordered array, similar to monitor presets:

```json
[
  {
    "name": "Night",
    "targets": [
      {
        "key": "dxlight",
        "r": 255,
        "g": 170,
        "b": 96,
        "brightness": 0.28,
        "on": true
      },
      {
        "key": "msi",
        "r": 0,
        "g": 0,
        "b": 0,
        "brightness": 0,
        "on": false
      }
    ]
  }
]
```

Use the existing `lightKey` convention on the frontend and the existing Rust
keys in `light_state.rs`: `dynamic:{device_id}`, `msi`, and `dxlight`.

## Rust Touchpoints

- Add `apps/windows/tauri/src/commands/light_presets.rs`.
- Register the module in `apps/windows/tauri/src/commands/mod.rs`.
- Add invoke handlers in `apps/windows/tauri/src/lib.rs`.
- Reuse write/apply functions from:
  - `commands/dynamic_lighting.rs`
  - `commands/lighting.rs`
  - `commands/dx_light.rs`
  - `commands/light_state.rs`
- Keep commands restricted to the main window with `require_window`.

Candidate commands:

- `get_light_presets() -> Vec<LightPreset>`
- `save_light_preset(preset: LightPreset) -> Vec<LightPreset>`
- `delete_light_preset(name: String) -> Vec<LightPreset>`
- `apply_light_preset(name: String) -> Vec<(String, Option<String>)>`

## Frontend Touchpoints

- Add wire types and invoke wrappers in `apps/windows/src/lib/commands.ts`.
- Add `lightPresets` to `apps/windows/src/lib/query-keys.ts`.
- Add a `PresetBar` to `apps/windows/src/routes/lights.tsx`, borrowing the
  compact interaction pattern from the Display route.
- Use Pickle UI primitives and lucide icons in Windows.
- Replace `window.prompt` only if a local naming modal already exists by then;
  otherwise keep the first slice simple and consistent with Display.

## UX Notes

- Presets should appear above individual light cards, close to Refresh/Restore.
- Applying a preset should show aggregate status, for example
  `Applied 2/3 lights; failed: dxlight (not connected)`.
- Updating should capture the current visible state for all known lights,
  including explicit off states.
- If no lights are connected but presets exist, allow delete/update management
  and disable apply with a clear status message.

## Test Plan

- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run rust:fmt:check`
- `pnpm run rust:clippy`
- Rust unit tests for persistence and apply target matching.
- Manual smoke:
  - save a preset from current light states
  - change lights
  - apply saved preset
  - update preset
  - delete preset
  - restart Pane and confirm presets persist
  - disconnect one target and confirm partial failure is reported

## Risks

- Dynamic Lighting device IDs may change across hardware reconnects. V1 should
  match by current ID and report missing targets; later work can add friendly
  fallback matching by device name.
- Light writes are device-specific and partially fallible. The apply command
  should not fail the entire preset on the first device error.
- Companion support needs a protocol update in `packages/protocol`; keep that
  change separate unless mobile light presets are part of the first release.
