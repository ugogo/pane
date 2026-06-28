<#
.SYNOPSIS
    Build + register Pane locally as a TRUSTED packaged build so features that
    require Windows package identity (e.g. Dynamic Lighting background control)
    can be tested WITHOUT cutting a release.

.DESCRIPTION
    Some Windows capabilities require package identity, which only exists for a
    registered MSIX/sparse package - not for a bare exe. Today that's background
    light control; more identity-gated features may be added later. This script
    reproduces what the per-machine installer hook does, but locally and without
    elevation:

      1. Stop any running pane.exe (it would lock target/release/pane.exe).
      2. Build pane.exe (release profile, so the embedded <msix> identity
         manifest from build.rs is present). Skippable with -SkipBuild.
      3. Build + sign the identity package and register it bound to the build
         dir. With the default self-signed cert, this requires an elevated shell
         so Windows AppX deployment trusts the cert in the machine root store.
      4. Optionally launch the freshly registered exe (-Run).

    This is a DEV loop. The shipping path is `pnpm run release` (per-machine
    NSIS installer, via scripts/prepare-release-artifacts.ps1). Identity-gated
    features will NOT work under `pnpm run dev` (unpackaged).

.PARAMETER SkipBuild
    Skip the tauri build; just (re)register the existing target/release/pane.exe.
    Use when only the identity package / registration changed.

.PARAMETER Run
    Launch target/release/pane.exe after registering.
#>

[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$Run
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($m) { Write-Host "error: $m" -ForegroundColor Red; exit 1 }
function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }

$exe = Join-Path $root "apps\windows\tauri\target\release\pane.exe"

# ---- stop running instance (releases the exe lock) -------------------------

Step "stopping any running pane.exe"
Get-Process -Name pane -ErrorAction SilentlyContinue | Stop-Process -Force

# ---- build ----------------------------------------------------------------

if (-not $SkipBuild) {
    Step "building pane.exe (release, no bundle)"
    # Run from the Windows app dir so Tauri resolves apps/windows/tauri/tauri.conf.json.
    # This is a prod-identity packaged-build test loop, so merge the prod overlay
    # (pane.prod) — same identity the released installer ships.
    $prodConfig = Join-Path $root "apps/windows/tauri/tauri.conf.prod.json"
    Push-Location (Join-Path $root "apps/windows")
    try {
        & pnpm exec tauri build --no-bundle --config $prodConfig
    } finally {
        Pop-Location
    }
    if ($LASTEXITCODE -ne 0) { Fail "tauri build failed." }
}
if (-not (Test-Path $exe)) { Fail "pane.exe not found at $exe (run without -SkipBuild first)." }

# ---- build + register identity package ------------------------------------

Step "building + registering identity package against build dir"
& (Join-Path $PSScriptRoot "build-identity-package.ps1") -DevSelfSigned -Register -ExternalLocation (Join-Path $root "apps\windows\tauri\target\release")
if ($LASTEXITCODE -ne 0) { Fail "identity package build/register failed." }

Write-Host ""
Write-Host "Registered. Pane should now appear under Settings -> Personalization ->" -ForegroundColor Green
Write-Host "Dynamic Lighting -> Background light control." -ForegroundColor Green

# ---- optional launch ------------------------------------------------------

if ($Run) {
    Step "launching $exe"
    Start-Process $exe
}
