# Pane Companion

React Native / Expo companion app for controlling a paired Pane desktop instance
from an iPhone. See [`docs/mobile-companion-plan.md`](../../docs/mobile-companion-plan.md)
for the full plan and slice roadmap.

## Run it on your iPhone (Expo Go)

Dev iteration uses [Expo Go](https://expo.dev/go) — free, no Apple Developer
Program membership, hot reload on a physical device. The phone and PC must be on
the **same Wi-Fi network**.

1. Install **Expo Go** from the App Store on your iPhone.
2. Start the bundler — from the **repo root** (no `cd` needed):
   ```powershell
   npm run companion:install
   npm run companion
   ```
   (Or run `npm install` / `npm start` directly inside `mobile/companion`.)
3. Scan the QR shown in the terminal with the iPhone **Camera** app to open the
   project in Expo Go. (This is the _dev-server_ QR — different from Pane's
   _pairing_ QR below.)
4. Edit `App.tsx` and the app hot-reloads.

If Metro serves a stale bundle (or after upgrading the SDK), start with a clean
cache — `npm run companion:clear` from the repo root. Do **not** use
`npm --prefix mobile/companion exec -- expo start -c`: `npm exec` keeps the
repo-root working directory, so Expo inspects the root project (which has no
`expo` dependency) and fails with _"module `expo` is not installed."_

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

- **iOS local network** — Expo Go asks once; allow it or requests to the desktop
  are silently blocked.
- **Windows Firewall** — allow Pane on Private networks the first time the
  companion server binds, or the phone cannot reach the port.

## Status & caveats

- Implemented: QR scan → pair → signed commands → brightness, presets, volume,
  lighting, accent popup, startup, snapshot, and events.
- **Expo Go transport:** HTTP over the LAN plus signed authenticated requests.
  This preserves the free iPhone workflow, but it is still a trusted-network
  transport because the pairing token and bearer token are not encrypted on the
  wire.
- Native-only features — Bonjour/mDNS discovery, certificate pinning, and custom
  iOS permission copy — are deferred because they require a custom iOS native
  build, which in practice requires Apple signing credentials for physical-device
  testing.
- If the desktop IP changes, pair again from Pane's Companion panel.
