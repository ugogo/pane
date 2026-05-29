# Security Hardening Plan — SHIPPED (2026-05-29, commit 03c5cb6)

This handoff turns the security audit into an implementation plan for Pane, a public Windows/Tauri desktop app. Treat the items below as defense-in-depth for a privileged local application: the frontend can invoke Rust commands that capture the screen, write the clipboard, register global shortcuts, modify startup behavior, control hardware lighting, install updates, and restart the app.

## Goals

- Reduce the blast radius of any frontend compromise.
- Make installer/update trust boundaries explicit and harder to subvert.
- Add public-repo supply-chain checks to CI.
- Document development-only security exceptions so they are not mistaken for production posture.

## Priority Order

1. Re-enable a strict Tauri CSP.
2. Split Tauri capabilities by window and gate sensitive commands by caller window.
3. Harden the installer identity-package hooks.
4. Separate dev identity signing from production signing.
5. Add CI security gates and pin workflow permissions/actions.
6. Clean up lower-risk documentation and Windows command-line edge cases.

## 1. Re-enable CSP

**Risk:** High

`src-tauri/tauri.conf.json` sets:

```json
"security": {
  "csp": null
}
```

With CSP disabled, any future XSS or unsafe content injection becomes a desktop-privilege problem because the frontend can reach Tauri IPC.

**Implementation notes:**

- Replace `csp: null` with a strict CSP suitable for a local bundled React app.
- Start with the narrowest possible policy and loosen only where the app actually needs it.
- The current UI uses inline `<style>` inside `CapturePreview.tsx`, so either move those keyframes into `src/styles.css` or allow a hash for that specific inline style. Prefer moving to CSS so `style-src 'self'` can stay strict.
- The capture preview uses `data:image/bmp;base64,...`; allow `img-src 'self' data:`.
- The updater endpoint is called from the Tauri updater plugin, not browser `fetch`, so do not add broad web `connect-src` unless testing proves it is needed.

**Candidate CSP:**

```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: asset: https://asset.localhost; connect-src 'self' ipc: http://ipc.localhost; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
```

Validate exact Tauri v2 protocol requirements during testing; keep the final policy as narrow as the app permits.

**Files:**

- `src-tauri/tauri.conf.json`
- `src/views/CapturePreview.tsx`
- `src/styles.css`

**Validation:**

- `npm run build`
- `npm run dev`
- Verify main window loads.
- Verify fullscreen capture preview renders.
- Verify area selector and preview child windows render.
- Check DevTools console for CSP violations.

## 2. Split Tauri Capabilities and Gate Commands

**Risk:** High

`src-tauri/capabilities/default.json` applies the same broad permissions to `main`, `area-selector`, and `capture-preview`, including updater, process restart, global shortcuts, and window/webview permissions.

**Implementation notes:**

- Create separate capability files:
  - `main.json`: main dashboard permissions.
  - `area-selector.json`: only what the selector needs.
  - `capture-preview.json`: only what the preview needs.
- Remove updater/process/global-shortcut permissions from child windows unless directly required.
- Avoid broad defaults when a narrower permission exists.
- Add caller-window validation to sensitive Rust commands using a `WebviewWindow` parameter where feasible.
- At minimum, restrict:
  - `installUpdate` / process restart usage to the main window.
  - `set_capture_hotkey`, `clear_capture_hotkey`, startup registry writes, and lighting writes to the main window.
  - `commit_region_capture` to the `area-selector` window.
  - `copy_latest_capture_to_clipboard` and `save_latest_capture_to_desktop` to `capture-preview` and possibly `main` if needed by UI.

**Suggested command guard pattern:**

```rust
fn require_window(window: &tauri::WebviewWindow, expected: &str) -> Result<(), String> {
    if window.label() == expected {
        Ok(())
    } else {
        Err("Command is not allowed from this window.".into())
    }
}
```

For commands that should be callable from multiple windows, accept a small allowlist.

**Files:**

- `src-tauri/capabilities/default.json`
- New files under `src-tauri/capabilities/`
- `src-tauri/src/commands/*.rs`
- `src-tauri/src/lib.rs`
- `src/lib/commands.ts`

**Validation:**

- Confirm normal UI flows still work:
  - Update check notice displays in main window.
  - Fullscreen capture from main window works.
  - Area capture can only commit from selector.
  - Preview can copy/save.
  - Hotkey configuration works only from main.
- Attempt disallowed IPC from child windows via DevTools/CDP and verify it fails.

## 3. Harden Installer Hooks

**Risk:** High

`src-tauri/installer-hooks.nsh` recursively searches `$INSTDIR` for `register-identity.ps1` / `unregister-identity.ps1` and executes the first match as admin with `ExecutionPolicy Bypass`.

**Implementation notes:**

- Stop using recursive `Get-ChildItem` lookup.
- Execute the exact expected resource path.
- If Tauri resource layout is not stable, resolve the known resource directory once and fail closed if more than one candidate exists.
- Add an integrity check before executing the scripts:
  - Either embed expected SHA-256 hashes in the NSIS hook.
  - Or Authenticode-sign the PowerShell scripts and require a valid signature.
- Keep install non-fatal for optional Dynamic Lighting, but log enough detail for troubleshooting.
- Make unregister equally strict; it currently removes any `CN=Pane` cert from `LocalMachine\TrustedPeople`.

**Files:**

- `src-tauri/installer-hooks.nsh`
- `src-tauri/resources/identity/register-identity.ps1`
- `src-tauri/resources/identity/unregister-identity.ps1`
- `src-tauri/tauri.conf.json`

**Validation:**

- Build installer.
- Install on a clean VM.
- Verify identity package registration succeeds.
- Verify the app still runs if identity registration fails.
- Uninstall and confirm only the Pane-owned identity/cert is removed.

## 4. Separate Dev and Production Identity Signing

**Risk:** High

`scripts/build-identity-package.ps1` defaults to a self-signed `CN=Pane` certificate and hardcoded PFX password `pane-dev`, then production release flow stages the resulting cert/package into the installer.

**Implementation notes:**

- Make dev self-signed signing opt-in, not the default for release.
- Add a `-DevSelfSigned` switch for local identity testing.
- For release mode, require an externally supplied production certificate and password via secure environment variables or secret store.
- Fail release if the default dev PFX path or `pane-dev` password is used.
- Consider using a hardware-backed or CI secret-backed signing flow.
- Rename comments and README language so updater signing and Windows Authenticode/code-signing are not conflated.

**Files:**

- `scripts/build-identity-package.ps1`
- `scripts/release.ps1`
- `scripts/dev-trusted.ps1`
- `README.md`
- `docs/tauri-migration-spike.md`

**Validation:**

- Dev flow still works with explicit `-DevSelfSigned`.
- Release flow fails without production signing inputs.
- Release flow succeeds with production signing inputs.
- Inspect the final installer and MSIX identity package signatures.

## 5. Add CI Security Gates

**Risk:** Medium

CI currently typechecks, builds, and runs clippy, but does not run dependency/security scans. `npm audit --omit=dev` is currently clean, while full `npm audit` reports two moderate dev advisories for Vite/esbuild. RustSec tooling was not installed locally during the audit.

**Implementation notes:**

- Add explicit workflow permissions:

```yaml
permissions:
  contents: read
```

- Pin GitHub Actions to commit SHAs or use a dependency bot policy that keeps them updated.
- Add:
  - `npm audit --omit=dev --audit-level=moderate`
  - A separate non-blocking or documented policy for dev-only npm advisories.
  - `cargo audit` or `cargo deny check advisories`.
  - GitHub dependency review for pull requests.
  - CodeQL for JavaScript/TypeScript and Rust if available for the repo.
- Add Dependabot or Renovate for npm, Cargo, and GitHub Actions.

**Files:**

- `.github/workflows/ci.yml`
- New `.github/dependabot.yml` or Renovate config
- Optional `deny.toml`

**Validation:**

- CI passes on a clean branch.
- A test PR with vulnerable dependency changes is blocked or reported according to policy.

## 6. Quote Startup Registry Command

**Risk:** Medium

`src-tauri/src/commands/startup.rs` writes the current executable path directly into `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.

**Implementation notes:**

- Quote the executable path before writing it.
- If arguments are ever added, construct the command line with explicit escaping.
- Add tests for paths containing spaces.

**Files:**

- `src-tauri/src/commands/startup.rs`

**Validation:**

- Enable startup from a path containing spaces.
- Inspect the Run value.
- Reboot or simulate logon and verify the app starts.

## 7. Document CDP Remote Debugging Risk

**Risk:** Low

`README.md` and `AGENTS.md` document enabling WebView2 CDP on port 9222, but do not warn that local processes can drive Tauri IPC while it is enabled.

**Implementation notes:**

- Add a short warning near the CDP instructions.
- State that CDP should only be enabled on trusted dev machines and never in production builds.
- Mention that CDP can invoke app internals, including capture and hardware commands.

**Files:**

- `README.md`
- `AGENTS.md`

**Validation:**

- Documentation clearly distinguishes dev-only debugging from production operation.

## 8. Review Sparse Package Capabilities

**Risk:** Low

`src-tauri/identity/AppxManifest.xml` enables:

- `uap10:AllowExternalContent`
- `runFullTrust`
- `unvirtualizedResources`

Some may be required for sparse package identity and Dynamic Lighting, but this should be documented with rationale.

**Implementation notes:**

- Confirm which capabilities are required for:
  - Sparse package external location.
  - Full-trust Win32 execution.
  - Dynamic Lighting app extension.
- Remove any capability not required.
- Add comments explaining why the remaining capabilities exist.

**Files:**

- `src-tauri/identity/AppxManifest.xml`
- `src-tauri/windows-app-manifest.xml`
- `docs/tauri-migration-spike.md`

**Validation:**

- Identity package still registers.
- Dynamic Lighting background control still works.
- App still launches with package identity.

## Completion Checklist

- [ ] CSP enabled and tested across all windows.
- [ ] Capabilities split per window.
- [ ] Sensitive commands verify caller window labels.
- [ ] Installer hooks execute exact trusted scripts only.
- [ ] Production release cannot use dev self-signed identity certificate by accident.
- [ ] README distinguishes updater signing from Authenticode/code signing.
- [ ] CI includes npm and Rust dependency security checks.
- [ ] GitHub Actions permissions are minimized.
- [ ] CDP documentation includes local-control warning.
- [ ] Sparse package capabilities are minimized or documented.

## Suggested Final Verification Matrix

- `npm run typecheck`
- `npm run build`
- `cd src-tauri; cargo clippy -- -D warnings`
- `npm audit --omit=dev --audit-level=moderate`
- Rust advisory scan through `cargo audit` or `cargo deny check advisories`
- Manual Tauri dev smoke test:
  - Main dashboard opens.
  - Fullscreen capture works.
  - Area selector works.
  - Preview copy/save works.
  - Hotkeys work.
  - Lighting controls still work on available hardware.
- Installer VM test:
  - Fresh install.
  - Identity package registration.
  - Update flow.
  - Uninstall cleanup.

