<#
.SYNOPSIS
    Run the local dev Tauri binary under the installed Home MSIX package
    identity, so it inherits the `com.microsoft.windows.lighting` AppExtension
    and any other capabilities declared in the manifest.

.DESCRIPTION
    `npm run tauri dev` produces an unpackaged Home.exe with no AppX identity.
    Without identity, Windows Dynamic Lighting won't grant LampArray access,
    so dev iteration on lighting features needs another launch path.

    This script:
      1. Builds the debug Tauri binary (frontend + Rust) without producing an
         installer  --  `tauri build --debug --no-bundle`.
      2. Looks up the installed `dev.home.app` package family name.
      3. Launches `src\src-tauri\target\debug\Home.exe` via
         `Invoke-CommandInDesktopPackage`, which runs the dev exe under the
         installed package's identity.

    Trade-offs vs `tauri dev`:
      - No Vite HMR for the frontend. The debug build embeds the current
        `dist/`. For UI-only work, prefer `npm run tauri dev`.
      - Rust changes still require a re-run of this script (no live reload).
      - Lighting works.

    Prerequisite: the MSIX must be installed at least once via
    `npm run tauri:windows:build` + Add-AppxPackage.

.EXAMPLE
    .\scripts\dev-packaged.ps1
#>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# ---- 1. Verify the packaged identity is installed ---------------------------

$pkg = Get-AppxPackage -Name "dev.home.app" -ErrorAction SilentlyContinue
if (-not $pkg) {
    Write-Error @"
dev.home.app is not installed.
Build and install the MSIX first:
    npm run tauri:windows:build
    Add-AppxPackage src\src-tauri\target\msix\Home_0.1.0.0_x64.msix
"@
    exit 1
}

Write-Host "Packaged identity: $($pkg.PackageFamilyName)"

# ---- 2. Kill any running Home instances (dev or packaged) -------------------

Get-Process -Name "Home" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  Stopping running Home (PID $($_.Id))..."
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 300

# ---- 3. Build the debug binary ----------------------------------------------

Set-Location $root
Write-Host "Building debug binary (this is slower than 'tauri dev' but produces a self-contained exe)..."
& npm run tauri -- build --debug --no-bundle
if ($LASTEXITCODE -ne 0) {
    Write-Error "tauri build failed (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
}

# ---- 4. Locate the freshly built exe ----------------------------------------

$exe = Join-Path $root "src\src-tauri\target\debug\Home.exe"
if (-not (Test-Path $exe)) {
    Write-Error "Built exe not found at $exe"
    exit 1
}

# ---- 5. Launch under packaged identity --------------------------------------

Write-Host ""
Write-Host "Launching $exe under $($pkg.PackageFamilyName)!App ..."
Write-Host "(Close the Home window or Ctrl+C here to stop.)"
Write-Host ""

Invoke-CommandInDesktopPackage `
    -PackageFamilyName $pkg.PackageFamilyName `
    -AppId "App" `
    -Command $exe `
    -PreventBreakaway
