# Pane Companion

React Native / Expo companion app for controlling a paired Pane desktop instance
from an iPhone. See [`docs/2026-06-01-mobile-companion-plan.md`](../../docs/2026-06-01-mobile-companion-plan.md)
for the full plan and slice roadmap.

## Run on your iPhone (dev client)

Control UI uses native sliders and Tamagui components that require a **custom dev
client** — **Expo Go is not supported** for the control screen.

1. Install dependencies from the repo root:
   ```powershell
   npm run companion:install
   ```
2. Build and run on a physical device (from repo root):
   ```powershell
   npm run companion
   ```
   This runs `expo run:ios --device` in `apps/mobile`. The phone and PC must be
   on the **same Wi-Fi network**.
3. Edit screens under `apps/mobile/app/` — Metro hot-reloads on device.

For a clean Metro cache: `npm run companion:clear`.

Expo Go may still work for non-control experiments, but pairing + sliders expect
the dev client build.

## Pairing flow

The desktop app owns pairing. In Pane: **Companion** panel → enable → **Pair**,
which shows a `pane://pair` QR containing the LAN host, port, and a short-lived
one-time token.

In the companion app: allow camera access → scan Pane's pairing QR. The app calls
`POST /v1/pair`, sends this phone's Ed25519 public key, receives a bearer device
token, and stores the token + private signing key in `expo-secure-store`.
Authenticated requests include timestamp, nonce, method/path/body hash, and an
Ed25519 signature. The control screen confirms the link via `/v1/hello` and
drives the allowlisted settings commands. **Unpair** clears the stored
credentials.

### Expected prompts

- **iOS local network** — allow it or requests to the desktop are silently blocked.
- **Windows Firewall** — allow Pane on Private networks the first time the
  companion server binds, or the phone cannot reach the port.

## Status & caveats

- Implemented: QR scan → pair → signed commands → brightness, presets, volume,
  lighting, accent popup, startup, snapshot, and events.
- **Dev client transport:** HTTP over the LAN plus signed authenticated requests.
  This preserves iteration on a physical device, but it is still a trusted-network
  transport because the pairing token and bearer token are not encrypted on the
  wire.
- Native-only features — Bonjour/mDNS discovery, certificate pinning, and custom
  iOS permission copy — are deferred because they require a custom iOS native
  build, which in practice requires Apple signing credentials for physical-device
  testing.
- If the desktop IP changes, pair again from Pane's Companion panel.
