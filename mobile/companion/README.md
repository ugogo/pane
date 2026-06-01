# Pane Companion

React Native / Expo companion app for controlling a paired Pane desktop instance
from an iPhone. See [`docs/mobile-companion-plan.md`](../../docs/mobile-companion-plan.md)
for the full plan and slice roadmap.

## Run it on your iPhone (Expo Go)

Dev iteration uses [Expo Go](https://expo.dev/go) — free, no Apple Developer
account, hot reload on a physical device. The phone and PC must be on the **same
Wi-Fi network**.

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
which shows a `pane://pair` QR containing the LAN host, port, and a one-time
token.

In the companion app: allow camera access → scan Pane's pairing QR. The app calls
`POST /v1/pair`, receives a bearer device token, and stores it in
`expo-secure-store`. The control screen then confirms the link via `/v1/hello`
and drives `set_brightness` commands from the slider. **Unpair** clears the
stored credentials.

### Expected prompts

- **iOS local network** — Expo Go asks once; allow it or requests to the desktop
  are silently blocked.
- **Windows Firewall** — allow Pane on Private networks the first time the
  companion server binds, or the phone cannot reach the port.

## Status & caveats

- Implemented: QR scan → pair → brightness control (plan slices 1–3).
- **Dev-only transport:** plain HTTP + bearer token over the LAN. Fine on a
  trusted home network for testing; TLS pinning and request signing (plan slices
  4–5) are required before any TestFlight build.
- The native-only features — Bonjour/mDNS discovery, certificate pinning, custom
  permission copy — need an [EAS](https://docs.expo.dev/build/introduction/) dev
  build and are not part of the Expo Go flow (plan slice 6).

## Later: dev build

Once the native slices land, build a dev client with EAS (cloud builds, no Mac
required; a free Apple account covers device provisioning):

```powershell
cd mobile/companion
npx eas-cli build --profile development --platform ios
```

(Run from inside `mobile/companion` — unlike `npm run`, `npm exec`/`npx` use the
current directory, not the package, to resolve the project.)
