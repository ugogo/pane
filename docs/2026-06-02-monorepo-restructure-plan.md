---
title: Monorepo Restructure & Shared Protocol — Implementation Plan
type: plan
status: shipped
created: 2026-06-02
updated: 2026-06-02
---

# Monorepo Restructure & Shared Protocol — Implementation Plan

> Audience: a cloud agent executing this cold. Everything needed is in this file.
> Author context: solo personal project (`pane`). Favor pragmatic, low-overhead
> solutions; do **not** add Turborepo/Nx or any build orchestrator — npm
> workspaces is sufficient. Do not over-engineer.

## Goal

The repo now spans three build targets that share a runtime contract:

- `src/` — React desktop frontend (the Tauri webview UI)
- `src-tauri/` — Rust backend (the actual desktop app + companion HTTP server)
- `mobile/companion/` — Expo / React Native phone companion

Improve separation of concerns and **eliminate hand-mirrored types** between
them, then (optionally) move to an `apps/` + `packages/` layout.

## Key architectural finding (the "why")

The phone app has **zero source/compile dependency** on the Tauri/Rust code. The
only coupling is at **runtime over HTTP**: the phone speaks the `/v1/*` wire
protocol to the running desktop app. So the dependency graph is:

```
        packages/protocol   ← the shared contract
         /            \
   apps/windows        apps/mobile
 (server side,         (client side,
  React FE + Rust)      Expo)
```

`windows` and `mobile` both depend on the **contract**, never on each other.
The Rust HTTP server is a private implementation detail of the desktop app.

### The duplication being removed

The companion protocol's types and rules are currently hand-mirrored in **three**
places. `tauri:gen` (`scripts/sync-tauri-gen.ts`) is **NOT** a type generator —
it only refreshes capability/ACL JSON. There is no automated type sharing today.

| Concern                                                                                                  | `src-tauri` (Rust, source of truth)                | `src` (desktop FE)                | `mobile/companion`                       |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------- | ---------------------------------------- |
| Wire types (`CompanionSnapshot`, `VolumeInfo`, `PresetInfo`, `AudioDeviceInfo`, `LightSnapshot`…)        | serde structs in `commands/companion*.rs`          | re-typed in `src/lib/commands.ts` | re-typed in `mobile/companion/App.tsx`   |
| Protocol constants (`/v1/*` paths, `x-pane-*` headers, signing message format, TTLs, `_pane._tcp.local`) | `const`s in `commands/companion.rs` (lines ~35–41) | —                                 | `const`s in `mobile/companion/App.tsx`   |
| Request signing (`method\npath\nts\nnonce\nbodySha256` over ed25519)                                     | verify side in `companion.rs`                      | —                                 | sign side in `App.tsx` (`signedHeaders`) |

If any of these drift, pairing silently breaks.

## Decisions locked in this conversation

- App folder is named **`windows`**, not `desktop`. The Rust here is ~entirely
  Windows OS-integration (DDC/CI brightness, MSI/dynamic lighting, Raw Input
  brightness keys, WASAPI audio, NSIS installer, Windows app manifest). A future
  Mac app would be a near-separate backend, not `#[cfg(target_os)]` branches —
  so `windows` is the honest name.
- `src-tauri` is renamed to `tauri` (nested under the app folder) as part of the move.
- **Out of scope for now (explicitly deferred):**
  - No `apps/mac/`.
  - No `packages/ui/` (shared React frontend). React-DOM vs React-Native can't
    share primitives without react-native-web/Tamagui — not worth it.
  - NOTE for the future: if a Mac app is ever built, step one is hoisting
    `apps/windows/src` → `packages/ui`. Leave a breadcrumb but build nothing now.

## Target structure

```
apps/
  windows/            # the Windows Tauri app (one app = FE + Rust)
    index.html
    vite.config.ts
    tsconfig.json
    package.json      # react, vite, @tauri-apps/*, build/dev scripts
    src/              #   ← today's ./src   (React frontend)
    tauri/            #   ← today's ./src-tauri  (Rust crate)
    dist/             #   vite build output (gitignored)
  mobile/             #   ← today's ./mobile/companion  (Expo, @pane/companion)
packages/
  protocol/           # @pane/protocol — the HTTP contract (plain .ts, no build step)
```

Root `package.json` becomes the **npm workspace root** (dev tooling + workspaces
field only); the frontend deps move into `apps/windows/package.json`.

---

## Phasing

Land in this order. Phase 1 delivers the real value and can ship **without**
moving any folders, keeping risk low. Phases 2–3 are independent follow-ups.

### Phase 1 — Extract `packages/protocol` (highest value, lowest risk)

Do this **before** any folder move, against the current layout.

1. Enable npm workspaces in root `package.json`:
   ```jsonc
   "workspaces": ["packages/*", "mobile/companion"]
   ```
   (add `apps/*` in Phase 2). Keep the existing root deps for now.
2. Create `packages/protocol/` as a **plain-TS, no-build** package:
   - `package.json`: `{ "name": "@pane/protocol", "version": "0.0.0", "private": true, "type": "module", "main": "src/index.ts", "types": "src/index.ts" }`
   - `src/constants.ts` — single source of truth for: endpoint paths
     (`/v1/hello`, `/v1/pair`, `/v1/commands`, `/v1/snapshot`, `/v1/events`),
     header names (`x-pane-signature`, `x-pane-timestamp`, `x-pane-nonce`,
     `x-pane-body-sha256`), `SERVICE_TYPE` (`_pane._tcp.local`),
     `PAIRING_TTL_SECONDS` (120), `SIGNATURE_MAX_SKEW_SECONDS` (300).
   - `src/types.ts` — the wire types (`CompanionSnapshot`, `VolumeInfo`,
     `PresetInfo`, `AudioDeviceInfo`, `LightSnapshot`, the `/v1/pair`
     request/response shapes). Hand-written **for now**; replaced by codegen in
     Phase 3. These must match the Rust serde structs in
     `src-tauri/src/commands/companion*.rs` exactly (camelCase via serde rename).
   - `src/signing.ts` — the pure ed25519 request signer extracted from
     `mobile/companion/App.tsx` (`signedHeaders` + the
     `method\npath\nts\nnonce\nbodySha256` message builder). Keep it dependency-light:
     it currently uses `@noble/ed25519` + `@noble/hashes`, which are pure JS and
     work in both RN and the webview. Inject the random-nonce + sha256 so the
     package stays platform-agnostic, OR depend on `@noble/*` directly (already a
     companion dep). Confirm the byte layout matches Rust verification.
   - `src/index.ts` — re-export the above.
3. Consume it:
   - `mobile/companion/App.tsx`: replace the local interfaces/consts/signing with
     imports from `@pane/protocol`. **Watch Metro resolution** (see Gotchas).
   - `src/lib/commands.ts`: import the shared companion wire types instead of the
     locally-declared `CompanionStatus`/`CompanionDevice`/etc. where they overlap
     the protocol. (Tauri-`invoke` result types that aren't part of the HTTP
     contract can stay local.)
4. Verify: `npm run typecheck`, `npm run companion:typecheck`, `npm run lint`,
   and a manual pairing smoke test (desktop ↔ phone) still works.

**Acceptance:** the constants/types/signing exist in exactly one place; both
clients import them; pairing still works end to end.

### Phase 2 — Folder restructure (`apps/` + rename)

Mechanical move + path rewrites. Do as one reviewable commit so the blast radius
is visible.

**Moves (use `git mv` to preserve history):**

- `src/` → `apps/windows/src/`
- `index.html`, `vite.config.ts`, `tsconfig.json` → `apps/windows/`
- `src-tauri/` → `apps/windows/tauri/`
- `mobile/companion/` → `apps/mobile/`

**Critical wiring (the move's real risk surface):**

- The Vite **root is currently the repo root** (`index.html` references
  `/src/main.tsx`; `@` alias → `./src`; `dist/` emitted at root;
  `tauri.conf.json` has `frontendDist: "../dist"`, `beforeBuildCommand: "npm run
build"`, `beforeDevCommand: "npx vite"`, `devUrl: http://localhost:1420`).
  Keep `index.html` + `vite.config.ts` + `src/` **together** in `apps/windows/`
  so those relative references stay valid. After the move, `dist` lands at
  `apps/windows/dist`, and `tauri/`'s `../dist` resolves to it. ✔
- Split root `package.json`: frontend deps + `build`/`typecheck`/`dev`/`tauri`
  scripts move to `apps/windows/package.json`; root keeps eslint/prettier/husky,
  `lint-staged`, and the `workspaces` field (now `["apps/*", "packages/*"]`).
- Decide where `tauri.conf.json`'s before-commands run from and whether they need
  `--prefix`/`-w apps/windows`. Validate `npm run tauri dev` and a release build.

**Files referencing `src-tauri` (≈18) — update path strings:**
`package.json` (rust:fmt, rust:fmt:check, rust:clippy, tauri:gen → `apps/windows/tauri/...`),
`.github/workflows/ci.yml` (`workspaces: src-tauri` → `apps/windows/tauri`, the
`working-directory:` steps, the identity `New-Item` paths),
`eslint.config.ts` (`reactSourceFiles`, the `ignores`/`files` globs:
`src/**` → `apps/windows/src/**`, `mobile/**` → `apps/mobile/**`,
`src-tauri/` → `apps/windows/tauri/`),
`.release-it.json`, `scripts/release.ps1`, `scripts/dev-trusted.ps1`,
`scripts/build-identity-package.ps1`, `scripts/prepare-release-artifacts.ps1`,
`scripts/sync-release-version.ts`, `scripts/sync-tauri-gen.ts`,
`scripts/format-file.ts`, `.github/dependabot.yml`, `README.md`, `AGENTS.md`,
`docs/*.md`, `.agents/skills/tauri-development/SKILL.md`.
Also update `mobile/companion` path refs in root `package.json`
(`companion*` scripts → `apps/mobile`) and `lint-staged` globs.

**Acceptance:** `npm install` (clean), `npm run typecheck`, `npm run lint`,
`npm run build`, `npm run tauri dev`, a release build, and the companion all
work from the new layout. CI green.

### Phase 3 — Rust → TS codegen (recommended follow-up)

Replace the hand-written `packages/protocol/src/types.ts` with generated types so
Rust serde structs are the single source of truth.

- Evaluate **`ts-rs`** (minimal: `#[derive(TS)]` on the companion structs, emits
  `.ts` on `cargo test`) vs **`tauri-specta`** (also generates typed `invoke`
  bindings → would additionally delete the hand-written half of
  `src/lib/commands.ts`). `tauri-specta` is more powerful but heavier; `ts-rs` is
  the lighter fit if the only goal is the wire types.
- Emit generated `.ts` into `packages/protocol/src/generated/`, re-export from
  `index.ts`, and add a check step (like the existing `tauri:gen:check` pattern)
  so drift fails CI.

**Acceptance:** wire types are generated, committed, drift-checked in CI; the
hand-written duplicates are deleted.

---

## Gotchas / watch-outs

- **Expo + npm workspace hoisting is the sharp edge.** Metro does not follow
  hoisted `node_modules` cleanly. The companion currently keeps its **own**
  `node_modules`/lockfile on purpose. If workspaces hoist its deps, add Metro
  config: `watchFolders` (repo root + `packages/protocol`) and
  `resolver.nodeModulesPaths`. Simplest mitigation: keep `@pane/protocol` as
  **plain `.ts` source** (no build artifact) so Metro transpiles it like app
  source. There is currently **no `metro.config.js`** — one may need to be added.
- **Keep the Expo SDK pin.** Project rule: pin `mobile/companion` (now
  `apps/mobile`) to the user's Expo Go "supported SDK" (was SDK 54), not npm
  latest. Workspace install must not silently bump it.
- **Self-signed release flow is intentional.** Don't touch signing; just keep
  the release flow working with the new paths. Cut releases with `npm run release`
  (the standalone `scripts/release.ps1` was removed 2026-06-02).
- **Signing byte-compatibility.** When extracting the signer into
  `@pane/protocol`, the message bytes and header encoding must remain identical
  to what `companion.rs` verifies — a mismatch breaks pairing silently. Smoke-test
  real pairing after the change.
- **`@` path alias** (`@/*` → `./src`) lives in both `tsconfig.json` and
  `vite.config.ts`; it stays correct as long as the frontend files move together.

## Quick reference — current file locations

- Rust protocol: `src-tauri/src/commands/companion.rs` (~1033 lines, structs +
  consts + axum router), `src-tauri/src/commands/companion_snapshot.rs` (~255).
- Desktop FE invoke layer: `src/lib/commands.ts` (~505 lines).
- Phone app: `mobile/companion/App.tsx` (~910 lines; interfaces ~52–103,
  signing ~165–230).
- Build wiring: `vite.config.ts`, root `tsconfig.json`, `index.html` (all at repo
  root today), `src-tauri/tauri.conf.json` (`frontendDist: ../dist`).
