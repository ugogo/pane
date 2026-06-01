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
| 7     | Remaining allowlisted commands (lighting, audio, presets, accent, startup), `GET /v1/snapshot`, `GET /v1/events`                                                                  | ⏳ Nice-to-have               |

> **Current transport is dev-only.** Slices 1–3 run plain HTTP with a bearer token over the LAN. That is safe enough on a trusted home network for testing, but **slices 4–5 (TLS pinning + signing) are mandatory before any TestFlight build** — until then the companion should stay behind a dev/trusted-network assumption.

## Key Changes

- Add a `CompanionCard` under Pane’s System section with:
  - enable/disable mobile companion
  - server status and local discovery name
  - “Pair iPhone” QR modal
  - paired devices list with revoke
- Add a Rust companion server started from Tauri setup only when enabled:
  - random local port (plain HTTP today; HTTPS in slice 4)
  - mDNS/Bonjour service `_pane._tcp.local` (slice 6)
  - unauthenticated `GET /v1/hello` only returns instance/version/public pairing metadata
  - authenticated `POST /v1/commands` today; `GET /v1/snapshot` and `GET /v1/events` in slice 7
- Add pairing:
  - Pane generates an install ID, pinned TLS certificate, and short-lived one-time pairing token.
  - QR contains version, local service name/port, certificate fingerprint/public key, token, and expiry.
  - iPhone sends device name plus its public signing key.
  - Pane stores paired device public keys and a single `settings` role.
- Add request security:
  - every paired-device request is signed with the iPhone device key
  - include timestamp, nonce, method/path/body hash
  - reject expired timestamps, reused nonces, revoked devices, and unknown schema versions
  - protect desktop private material with DPAPI or user-local restricted storage
- Add a React Native / Expo app under `mobile/companion`:
  - QR scanner onboarding (`expo-camera`)
  - device bearer token stored in `expo-secure-store`
  - brightness control today; Lighting, Audio, and other settings screens follow in slice 7
  - later (dev build): local-network permission copy, Bonjour discovery, and certificate pinning from QR material

## Public Interfaces

- Desktop Tauri commands:
  - `get_companion_status`
  - `set_companion_enabled(enabled)`
  - `start_companion_pairing`
  - `cancel_companion_pairing`
  - `list_companion_devices`
  - `revoke_companion_device(deviceId)`
- LAN API:
  - `GET /v1/hello` (implemented)
  - `POST /v1/pair` (implemented)
  - `POST /v1/commands` (implemented)
  - `GET /v1/snapshot` (slice 7)
  - `GET /v1/events` (slice 7)
- Allowed mobile commands (`CompanionCommand` enum):
  - set brightness 0–100 across all monitors (implemented)
  - the following are planned for slice 7:
    - apply light color/brightness or turn light off
    - apply monitor preset
    - set default output/input audio device
    - set output/input volume and mute
    - set accent popup enabled
    - set run-at-startup enabled
- Explicitly excluded from v1:
  - screenshots/capture
  - clipboard writes
  - hotkey editing
  - updater install/restart
  - arbitrary Tauri command invocation

## Implementation Notes

- Refactor existing Rust command logic into reusable service functions where needed; Tauri IPC and companion HTTP routes should call the same internal operations.
- Use Rust dependencies for HTTP, discovery, TLS, and signing, likely `axum`, `mdns-sd`, `rustls`/`rcgen`, `ed25519-dalek`, and `rand`.
- Keep the protocol transport-neutral: HTTP routes should convert requests into a `CompanionCommand` enum so a future relay can submit the same signed command envelope.
- Future Pane Relay design: desktop opens an outbound WebSocket to the relay; iPhone connects to the relay; relay forwards signed device commands but desktop remains the final authorization point.

## Test Plan

- Rust unit tests:
  - pairing token expiry and single-use behavior (implemented)
  - bearer authorization of paired devices (implemented)
  - command allowlist enforcement — non-allowlisted types fail to decode (implemented)
  - `/v1/hello` served over a real socket (implemented)
  - signature verification (slice 5)
  - timestamp/nonce replay rejection (slice 5)
  - revoked device rejection
- Integration tests:
  - pair a simulated device
  - fetch snapshot
  - run allowed mocked settings commands
  - verify excluded capture/update/clipboard actions are impossible through companion API
- Manual smoke tests:
  - iPhone local network permission prompt
  - Windows firewall prompt behavior
  - pair via QR
  - revoke and confirm access stops
  - restart Pane and confirm paired device persists
  - reconnect after IP address changes
  - verify no secrets appear in mDNS records

## Assumptions

- First release target is Personal/TestFlight.
- V1 uses QR pairing, same settings role for all paired phones, and System-card device management.
- LAN control ships first; hosted Pane Relay is reserved for later.
- The mobile client is React Native / Expo. Dev iteration uses [Expo Go](https://expo.dev/go) (free, no Apple Developer account, hot reload); the native-only slices (mDNS, TLS pinning, custom permission copy) move to an [EAS](https://docs.expo.dev/build/introduction/) dev build later.
- iOS local networking follows Apple local-network and Bonjour requirements: [NSLocalNetworkUsageDescription](https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSLocalNetworkUsageDescription), [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy), and [Network framework](https://developer.apple.com/documentation/Network).
- Mobile crypto uses Expo/RN equivalents (e.g. an Ed25519 library, Keychain via `expo-secure-store`); Rust server pieces use documented crates such as [axum](https://docs.rs/axum), [mdns-sd](https://docs.rs/mdns-sd), and signing/TLS equivalents.
