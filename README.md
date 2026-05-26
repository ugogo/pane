# Home

Windows utility suite monorepo — **Light Controls** and **CleanShot** in one PowerToys-style hub.

## Stack

- **.NET 10** + **WinUI 3**
- `Home.Hub` — unified control panel
- Shared libraries: `Home.Core`, `Home.Windows`, `CleanShot.Core`, `DXLight.Core`, `LightControls.Core`

## Commands

```powershell
npm run build
npm test
npm start                      # launch Home.Hub (recommended)
npm run start:light-controls   # standalone Light Controls module
npm run start:cleanshot        # standalone CleanShot module
```

## Home.Hub

Single tray app with sidebar navigation:

- **Home** — enable/disable Light Controls and CleanShot
- **General** — run at startup (login + wake-from-sleep)

Settings:

- Hub: `%LocalAppData%\Home\hub-settings.json`
- CleanShot: `%LocalAppData%\Home\cleanshot-settings.json`

## Status

- Phase 1–4: monorepo, shared cores, module system, and Home.Hub shell
