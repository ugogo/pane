# Pane Companion

React Native companion app for controlling a paired Pane desktop instance from
an iPhone.

## Development

This app is intended to start as an Expo Dev Client project. Early iPhone
testing can use direct Xcode device installs; TestFlight can come later when a
paid Apple Developer Program account is available.

```powershell
cd mobile/companion
npm install
npm run ios
```

## Pairing Direction

The desktop app owns pairing. Pane generates a short-lived `pane://pair` payload
from the System > Mobile companion card. The React Native app will scan that
payload, discover the `_pane._tcp` Bonjour service on the local network, pin the
desktop certificate, and register a device signing key.
