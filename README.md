# Home

Windows utility suite monorepo — **DX Light**, **Light Controls**, and **CleanShot**.

## Stack

- **.NET 10**
- **WinUI 3** (hub — planned)
- Legacy standalone apps preserved under `legacy/` during migration

## Layout

```
src/           Shared core libraries (DXLight.Core, LightControls.Core)
legacy/        Standalone app shells (WinForms, WPF, WinUI)
tests/         Unit tests (96 tests)
tools/         Dev utilities
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

**Phase 1 complete** — three apps copied into monorepo, unified on .NET 10, all tests passing.

Next: extract `CleanShot.Core`, build `Home.Hub` WinUI shell.
