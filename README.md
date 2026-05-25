# Home

Windows utility suite monorepo — **DX Light**, **Light Controls**, and **CleanShot** in one PowerToys-style hub.

## Stack

- **.NET 10** + **WinUI 3**
- `Home.Hub` — unified control panel
- Shared libraries: `Home.Core`, `Home.Windows`, `CleanShot.Core`, `DXLight.Core`, `LightControls.Core`

## Commands

```powershell
npm run build
npm test
npm start                      # launch Home.Hub (recommended)
npm run start:dx-light         # legacy standalone apps
npm run start:light-controls
npm run start:cleanshot
```

## Home.Hub

Single tray app with sidebar navigation:

- **Home** — enable/disable DX Light, Light Controls, CleanShot
- **General** — run at startup

Settings: `%LocalAppData%\Home\hub-settings.json`

## Status

- Phase 1–2: monorepo + shared cores
- Phase 3–4: module system + Home.Hub shell (MVP)
