---
title: Pane iPhone Companion Plan
status: shipped
---

# Pane iPhone Companion Plan

## Summary

Build a local-first companion that securely controls Pane settings from an iPhone. V1 is a cost-free Expo Go workflow, LAN-only in behavior, with a signed command envelope and device identity model designed so a future Pane Relay can forward the same signed commands without opening router ports.

Do not expose Tauri IPC over the network. Add a new Rust companion subsystem that calls a narrow allowlist of existing Pane setting operations.

The mobile client is **React Native / Expo** (not native SwiftUI). An Android companion is a likely future target, so the cross-platform path is worth the trade-off; dev iteration and actual iPhone testing run in **Expo Go** (free, no Apple Developer Program membership, hot reload on a physical device).

## Delivery Approach

Built as thin vertical slices so each one is independently testable and de-risks the architecture before the next. The native-module-heavy pieces (TLS pinning, mDNS) are deliberately deferred because physical iPhone testing must remain cost-free in Expo Go.

| Slice | Scope                                                                                                                                                                             | Status   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1     | `axum` server on a random LAN port + unauthenticated `GET /v1/hello`; port wired into status + pairing URI; auto-start on launch when enabled                                     | ✅ Done  |
| 2     | `POST /v1/pair` (one-time token → bearer device token) and `POST /v1/commands` (allowlisted `CompanionCommand` enum); window-free `brightness::set_all_brightness_pct` service fn | ✅ Done  |
| 3     | Scannable QR in the Companion card; Expo Go app: camera → scan → pair → persisted bearer token → brightness slider                                                                | ✅ Done  |
| 4     | Replace plain HTTP with TLS + QR-pinned certificate (`rcgen`/`rustls`)                                                                                                            | Deferred |
| 5     | Replace bearer token with Ed25519 request signing (timestamp + nonce + body hash; replay rejection); DPAPI-protected key storage                                                  | ✅ Done  |
| 6     | mDNS/Bonjour discovery (`_pane._tcp`) so the phone finds Pane without a typed host; requires a native iOS build, so it is outside the cost-free Expo Go path                      | Deferred |
| 7     | Remaining allowlisted commands (lighting, audio, presets, accent, startup), `GET /v1/snapshot`, `GET /v1/events`                                                                  | ✅ Done  |

> **Current transport is Expo-Go-compatible HTTP + signed requests on a trusted LAN.** Pairing still requires physical access to the desktop QR code. TLS pinning and Bonjour discovery require native iOS builds, which conflicts with the cost-free/no-Apple-Developer-Program requirement, so they are deferred.

## Key Changes

- [x] Add a `CompanionCard` under Pane’s System section with:
  - [x] enable/disable mobile companion
  - [x] server status and local discovery name
  - [x] “Pair iPhone” QR modal
  - [x] paired devices list with revoke
- [x] Add a Rust companion server started from Tauri setup only when enabled:
  - [x] random local port over HTTP for Expo Go
  - [ ] mDNS/Bonjour service `_pane._tcp.local` (deferred; native iOS build required)
  - [x] unauthenticated `GET /v1/hello` only returns instance/version/public pairing metadata
  - [x] authenticated `POST /v1/commands`; [x] `GET /v1/snapshot` and [x] `GET /v1/events` (SSE)
- [x] Add pairing:
  - [x] Pane generates install ID and short-lived one-time pairing token (QR over LAN)
  - [ ] QR includes pinned TLS certificate fingerprint/public key (deferred; native iOS build required)
  - [x] iPhone sends device name; Pane stores paired device bearer tokens with a single `settings` role
  - [x] iPhone sends public signing key (slice 5)
- [x] Add request security:
  - [x] bearer token auth for paired devices (dev-only; slice 2)
  - [x] every paired-device request signed with the iPhone device key (slice 5)
  - [x] timestamp, nonce, method/path/body hash; replay rejection (slice 5)
  - [ ] DPAPI-protected desktop TLS private material (deferred with TLS)
- [x] Add a React Native / Expo app under `mobile/companion`:
  - [x] QR scanner onboarding (`expo-camera`)
  - [x] device bearer token stored in `expo-secure-store`
  - [x] brightness control; [x] presets, output volume, lighting, accent, and startup controls (slice 7)
  - [ ] later (native dev build): local-network permission copy and certificate pinning from QR material
  - [ ] later (native dev build): Bonjour discovery UI/reconnect flow

## Public Interfaces

- Desktop Tauri commands:
  - [x] `get_companion_status`
  - [x] `set_companion_enabled(enabled)`
  - [x] `start_companion_pairing`
  - [x] `cancel_companion_pairing`
  - [x] `list_companion_devices` (via status payload)
  - [x] `revoke_companion_device(deviceId)`
- LAN API:
  - [x] `GET /v1/hello` (implemented)
  - [x] `POST /v1/pair` (implemented)
  - [x] `POST /v1/commands` (implemented)
  - [x] `GET /v1/snapshot`
  - [x] `GET /v1/events`
- Allowed mobile commands (`CompanionCommand` enum):
  - [x] set brightness 0–100 across all monitors (implemented)
  - [x] apply light color/brightness or turn light off
  - [x] apply monitor preset
  - [x] set default output/input audio device
  - [x] set output/input volume and mute
  - [x] set accent popup enabled
  - [x] set run-at-startup enabled
- Explicitly excluded from v1:
  - [x] screenshots/capture (not in allowlist)
  - [x] clipboard writes (not in allowlist)
  - [x] hotkey editing (not in allowlist)
  - [x] updater install/restart (not in allowlist)
  - [x] arbitrary Tauri command invocation (not in allowlist)

## Implementation Notes

- Refactor existing Rust command logic into reusable service functions where needed; Tauri IPC and companion HTTP routes should call the same internal operations.
- Use Rust dependencies for HTTP and signing: `axum`, `ed25519-dalek`, `sha2`, and `rand`. Defer `mdns-sd` and `rustls`/`rcgen` until a native mobile build is acceptable.
- Keep the protocol transport-neutral: HTTP routes should convert requests into a `CompanionCommand` enum so a future relay can submit the same signed command envelope.
- Future Pane Relay design: desktop opens an outbound WebSocket to the relay; iPhone connects to the relay; relay forwards signed device commands but desktop remains the final authorization point.

## Test Plan

- Rust unit tests:
  - [x] pairing token expiry and single-use behavior (implemented)
  - [x] bearer authorization of paired devices (implemented)
  - [x] command allowlist enforcement — non-allowlisted types fail to decode (implemented)
  - [x] `/v1/hello` served over a real socket (implemented)
  - [x] signature verification (slice 5)
  - [x] timestamp/nonce replay rejection (slice 5)
  - [x] revoked device rejection
- Dismissed automation:
  - [x] simulated-device integration tests; actual-device smoke testing is the release gate for this LAN companion flow
- Actual-device smoke tests:
  - [ ] iPhone local network permission prompt
  - [ ] Windows firewall prompt behavior
  - [x] pair via QR
  - [x] revoke and confirm access stops
  - [ ] restart Pane and confirm paired device persists
  - [ ] pair again after desktop IP address changes

## Assumptions

- First release target is personal/local use through Expo Go.
- V1 uses QR pairing, same settings role for all paired phones, and System-card device management.
- LAN control ships first; hosted Pane Relay is reserved for later.
- The mobile client is React Native / Expo. Dev iteration and actual-device testing use [Expo Go](https://expo.dev/go) (free, no Apple Developer Program membership, hot reload); native-only slices (mDNS, TLS pinning, custom permission copy) are deferred unless the Apple signing requirement changes or the project accepts a paid Apple Developer Program membership.
- iOS local networking still follows Apple local-network privacy behavior, but Expo Go owns the native permission strings.
- Mobile crypto uses Expo/RN equivalents (Ed25519 via `@noble/ed25519`, hashing via `expo-crypto`, secure persistence via `expo-secure-store`); Rust server pieces use documented crates such as [axum](https://docs.rs/axum) and signing equivalents.
