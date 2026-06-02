<#
.SYNOPSIS
    Build Pane's release-only artifacts for release-it.

.DESCRIPTION
    release-it owns version selection, npm versioning, git commit/tag/push, and
    GitHub release upload. This hook keeps the Pane-specific pieces explicit:
    Dynamic Lighting identity package signing, Tauri NSIS/updater build, and
    latest.json generation.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$Tag = "v$Version",
    [string]$SigningKey = "$HOME\.tauri\pane-updater.key"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($msg) {
    Write-Host "error: $msg" -ForegroundColor Red
    exit 1
}

function Step($msg) {
    Write-Host "==> $msg" -ForegroundColor Cyan
}

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Fail "expected stable semver x.y.z, got '$Version'."
}

$remote = (git remote get-url origin).Trim()
$slug = $remote -replace '^git@github\.com:', '' -replace '^https://github\.com/', '' -replace '\.git$', ''

if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    if (-not (Test-Path -LiteralPath $SigningKey)) {
        Fail "updater signing key not found at '$SigningKey'. Set -SigningKey or TAURI_SIGNING_PRIVATE_KEY."
    }
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath $SigningKey -Raw
}

if ($null -eq $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
}

Step "building + signing Dynamic Lighting identity package"
& (Join-Path $PSScriptRoot "build-identity-package.ps1") -StageBundle -DevSelfSigned -Version $Version
if ($LASTEXITCODE -ne 0) { Fail "identity package build failed." }

Step "building + signing installer"
# Run from the Windows app dir so Tauri resolves apps/windows/tauri/tauri.conf.json
# and runs beforeBuildCommand (npm run build) against apps/windows. Merge the
# prod overlay explicitly so the released build's identity (pane.prod) is never
# an implicit default — it mirrors the dev overlay used by scripts/dev.ps1.
$prodConfig = Join-Path $root "apps/windows/tauri/tauri.conf.prod.json"
Push-Location (Join-Path $root "apps/windows")
try {
    npx tauri build --ci --config $prodConfig
} finally {
    Pop-Location
}
if ($LASTEXITCODE -ne 0) { Fail "tauri build failed." }

$nsisDir = Join-Path $root "apps/windows/tauri/target/release/bundle/nsis"
$installer = Get-ChildItem -LiteralPath $nsisDir -Filter "*$Version*-setup.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1
if (-not $installer) { Fail "could not find the $Version installer in $nsisDir." }

$sigPath = "$($installer.FullName).sig"
if (-not (Test-Path -LiteralPath $sigPath)) {
    Fail "installer signature not found at $sigPath (is createUpdaterArtifacts enabled?)."
}

Step "generating latest.json"
$signature = (Get-Content -LiteralPath $sigPath -Raw).Trim()
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$downloadUrl = "https://github.com/$slug/releases/download/$Tag/$($installer.Name)"
$manifest = [ordered]@{
    version   = $Version
    notes     = "Existing installs update automatically."
    pub_date  = $pubDate
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = $signature
            url       = $downloadUrl
        }
    }
}

$latestPath = Join-Path $nsisDir "latest.json"
[System.IO.File]::WriteAllText($latestPath, ($manifest | ConvertTo-Json -Depth 6))

Write-Host "Prepared release artifacts:" -ForegroundColor Green
Write-Host "  $($installer.FullName)"
Write-Host "  $sigPath"
Write-Host "  $latestPath"
