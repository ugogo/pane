# Pane iPhone Companion Plan

## Summary

Build a local-first companion that securely controls Pane settings from an iPhone. V1 is Personal/TestFlight, LAN-only in behavior, but its command envelope and device identity model are designed so a future Pane Relay can forward the same signed commands without opening router ports.

Do not expose Tauri IPC over the network. Add a new Rust companion subsystem that calls a narrow allowlist of existing Pane setting operations.

The mobile client is **React Native / Expo** (not native SwiftUI). An Android companion is a likely future target, so the cross-platform path is worth the trade-off; dev iteration runs in **Expo Go** (free, no Apple Developer account, hot reload on a physical device).

## Delivery Approach

Built as thin vertical slices so each one is independently testable and de-risks the architecture before the next. The hard, native-module-heavy pieces (TLS pinning, signing, mDNS) are deliberately deferred so an end-to-end round-trip lands early.

| Slice | Scope                                                                                                                                                                             | Status                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1     | `axum` server on a random LAN port + unauthenticated `GET /v1/hello`; port wired into status + pairing URI; auto-start on launch when enabled                                     | ✅ Done                       |
| 2     | `POST /v1/pair` (one-time token → bearer device token) and `POST /v1/commands` (allowlisted `CompanionCommand` enum); window-free `brightness::set_all_brightness_pct` service fn | ✅ Done                       |
| 3     | Scannable QR in the Companion card; Expo Go app: camera → scan → pair → persisted bearer token → brightness slider                                                                | ✅ Done                       |
| 4     | Replace plain HTTP with TLS + QR-pinned certificate (`rcgen`/`rustls`)                                                                                                            | ⏳ Required before TestFlight |
| 5     | Replace bearer token with Ed25519 request signing (timestamp + nonce + body hash; replay rejection); DPAPI-protected key storage                                                  | ⏳ Required before TestFlight |
| 6     | mDNS/Bonjour discovery (`_pane._tcp`) so the phone finds Pane without a typed host; move app to an EAS dev build for the native bits                                              | ⏳ Nice-to-have               |
| 7     | Remaining allowlisted commands (lighting, audio, presets, accent, startup), `GET /v1/snapshot`, `GET /v1/events`                                                                  | ✅ Done                       |

> **Current transport is dev-only.** Slices 1–3 run plain HTTP with a bearer token over the LAN. That is safe enough on a trusted home network for testing, but **slices 4–5 (TLS pinning + signing) are mandatory before any TestFlight build** — until then the companion should stay behind a dev/trusted-network assumption.

## Key Changes

- [x] Add a `CompanionCard` under Pane’s System section with:
  - [x] enable/disable mobile companion
  - [x] server status and local discovery name
  - [x] “Pair iPhone” QR modal
  - [x] paired devices list with revoke
- [ ] Add a Rust companion server started from Tauri setup only when enabled:
  - [x] random local port (plain HTTP today; HTTPS in slice 4)
  - [ ] mDNS/Bonjour service `_pane._tcp.local` (slice 6)
  - [x] unauthenticated `GET /v1/hello` only returns instance/version/public pairing metadata
  - [x] authenticated `POST /v1/commands`; [x] `GET /v1/snapshot` and [x] `GET /v1/events` (SSE)
- [ ] Add pairing:
  - [x] Pane generates install ID and short-lived one-time pairing token (QR over LAN)
  - [ ] QR includes pinned TLS certificate fingerprint/public key (slice 4)
  - [x] iPhone sends device name; Pane stores paired device bearer tokens with a single `settings` role
  - [ ] iPhone sends public signing key (slice 5)
- [ ] Add request security:
  - [x] bearer token auth for paired devices (dev-only; slice 2)
  - [ ] every paired-device request signed with the iPhone device key (slice 5)
  - [ ] timestamp, nonce, method/path/body hash; replay rejection (slice 5)
  - [ ] DPAPI-protected desktop private material (slice 5)
- [x] Add a React Native / Expo app under `mobile/companion`:
  - [x] QR scanner onboarding (`expo-camera`)
  - [x] device bearer token stored in `expo-secure-store`
  - [x] brightness control; [x] presets, output volume, lighting, accent, and startup controls (slice 7)
  - [ ] later (dev build): local-network permission copy, Bonjour discovery, certificate pinning from QR material

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
- Use Rust dependencies for HTTP, discovery, TLS, and signing, likely `axum`, `mdns-sd`, `rustls`/`rcgen`, `ed25519-dalek`, and `rand`.
- Keep the protocol transport-neutral: HTTP routes should convert requests into a `CompanionCommand` enum so a future relay can submit the same signed command envelope.
- Future Pane Relay design: desktop opens an outbound WebSocket to the relay; iPhone connects to the relay; relay forwards signed device commands but desktop remains the final authorization point.

## Test Plan

- Rust unit tests:
  - [x] pairing token expiry and single-use behavior (implemented)
  - [x] bearer authorization of paired devices (implemented)
  - [x] command allowlist enforcement — non-allowlisted types fail to decode (implemented)
  - [x] `/v1/hello` served over a real socket (implemented)
  - [ ] signature verification (slice 5)
  - [ ] timestamp/nonce replay rejection (slice 5)
  - [ ] revoked device rejection
- Integration tests:
  - [ ] pair a simulated device
  - [ ] fetch snapshot
  - [ ] run allowed mocked settings commands
  - [ ] verify excluded capture/update/clipboard actions are impossible through companion API
- Manual smoke tests:
  - [ ] iPhone local network permission prompt
  - [ ] Windows firewall prompt behavior
  - [x] pair via QR
  - [x] revoke and confirm access stops
  - [ ] restart Pane and confirm paired device persists
  - [ ] reconnect after IP address changes
  - [ ] verify no secrets appear in mDNS records

## Assumptions

- First release target is Personal/TestFlight.
- V1 uses QR pairing, same settings role for all paired phones, and System-card device management.
- LAN control ships first; hosted Pane Relay is reserved for later.
- The mobile client is React Native / Expo. Dev iteration uses [Expo Go](https://expo.dev/go) (free, no Apple Developer account, hot reload); the native-only slices (mDNS, TLS pinning, custom permission copy) move to an [EAS](https://docs.expo.dev/build/introduction/) dev build later.
- iOS local networking follows Apple local-network and Bonjour requirements: [NSLocalNetworkUsageDescription](https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSLocalNetworkUsageDescription), [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy), and [Network framework](https://developer.apple.com/documentation/Network).
- Mobile crypto uses Expo/RN equivalents (e.g. an Ed25519 library, Keychain via `expo-secure-store`); Rust server pieces use documented crates such as [axum](https://docs.rs/axum), [mdns-sd](https://docs.rs/mdns-sd), and signing/TLS equivalents.
