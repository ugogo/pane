# Pane iPhone Companion Plan

## Summary

Build a local-first native iOS companion that securely controls Pane settings from an iPhone. V1 is Personal/TestFlight, LAN-only in behavior, but its command envelope and device identity model are designed so a future Pane Relay can forward the same signed commands without opening router ports.

Do not expose Tauri IPC over the network. Add a new Rust companion subsystem that calls a narrow allowlist of existing Pane setting operations.

## Key Changes

- Add a `CompanionCard` under Pane’s System section with:
  - enable/disable mobile companion
  - server status and local discovery name
  - “Pair iPhone” QR modal
  - paired devices list with revoke
- Add a Rust companion server started from Tauri setup only when enabled:
  - HTTPS on a random local port
  - mDNS/Bonjour service `_pane._tcp.local`
  - unauthenticated `GET /v1/hello` only returns instance/version/public pairing metadata
  - authenticated `GET /v1/snapshot`, `POST /v1/commands`, and `GET /v1/events`
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
- Add native SwiftUI iOS app under `mobile/ios/PaneCompanion`:
  - QR scanner onboarding
  - local network permission copy and Bonjour discovery via Apple Network framework
  - certificate pinning via QR material
  - CryptoKit-backed device keys
  - screens for Lighting, Brightness, Audio, and basic Pane settings

## Public Interfaces

- Desktop Tauri commands:
  - `get_companion_status`
  - `set_companion_enabled(enabled)`
  - `start_companion_pairing`
  - `cancel_companion_pairing`
  - `list_companion_devices`
  - `revoke_companion_device(deviceId)`
- LAN API:
  - `GET /v1/hello`
  - `POST /v1/pair`
  - `GET /v1/snapshot`
  - `POST /v1/commands`
  - `GET /v1/events`
- Allowed v1 mobile commands:
  - apply light color/brightness or turn light off
  - apply monitor preset
  - adjust all brightness
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
  - pairing token expiry and single-use behavior
  - signature verification
  - timestamp/nonce replay rejection
  - revoked device rejection
  - command allowlist enforcement
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
- iOS local networking follows Apple local-network and Bonjour requirements: [NSLocalNetworkUsageDescription](https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSLocalNetworkUsageDescription), [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy), and [Network framework](https://developer.apple.com/documentation/Network).
- iOS cryptography uses [CryptoKit](https://developer.apple.com/documentation/cryptokit); Rust server pieces use documented crates such as [axum](https://docs.rs/axum), [mdns-sd](https://docs.rs/mdns-sd), and signing/TLS equivalents.
