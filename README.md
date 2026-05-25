# Home

Windows utility suite monorepo — **DX Light**, **Light Controls**, and **CleanShot**.

## Stack

- **.NET 10**
- **WinUI 3** (hub — planned)
- Shared libraries: `CleanShot.Core`, `Home.Windows`
- Legacy standalone apps under `legacy/` during migration

## Layout

```
src/
  DXLight.Core/        Robobloq USB lighting
  LightControls.Core/  OpenRGB + Logitech + DX Light backends
  CleanShot.Core/      Screenshot/hotkey/settings logic
  Home.Windows/        Shared single-instance, startup, hotkey coordination
legacy/                Standalone app shells (WinForms, WPF, WinUI)
tests/                 96 unit tests
```

## Commands

```powershell
npm run build
npm test
npm run start:dx-light
npm run start:light-controls
npm run start:cleanshot
```

## Status

- **Phase 1:** monorepo bootstrap + three apps copied
- **Phase 2:** `CleanShot.Core` extracted, `Home.Windows` shared helpers added
- **Next:** `Home.Hub` WinUI control panel
