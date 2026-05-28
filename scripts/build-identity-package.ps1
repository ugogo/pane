<#
.SYNOPSIS
    Build and sign the Pane sparse identity package (.msix).

.DESCRIPTION
    Produces an identity-only MSIX ("sparse package with external location")
    that grants pane.exe Windows package identity. This is what lets Pane
    register as a Windows Dynamic Lighting background controller and appear in
    Settings -> Personalization -> Dynamic Lighting -> Background light control.

    Steps:
      1. Resolve the app version (from tauri.conf.json unless -Version given) and
         rewrite the Version in a staged copy of identity/AppxManifest.xml.
      2. Stage the manifest + logo assets (from src-tauri/icons) + the public
         folder into a temp build dir.
      3. Pack it with MakeAppx into target/release/bundle/identity/Pane-<ver>.msix.
      4. Ensure a code-signing cert exists (self-signed for dev) whose subject
         matches the manifest Publisher, trust its public cert locally, and sign
         the package with SignTool.
      5. Optionally register it against an install dir (-Register -ExternalLocation).

    The Publisher in identity/AppxManifest.xml and the publisher in
    src-tauri/windows-app-manifest.xml must both equal the signing cert subject
    (default CN=Pane). For distribution, replace the self-signed cert with a real
    code-signing certificate and keep all three in sync.

.PARAMETER Version
    4-part-friendly app version (e.g. 0.4.0). Defaults to tauri.conf.json.

.PARAMETER Publisher
    Certificate subject / manifest Publisher. Default "CN=Pane".

.PARAMETER PfxPath
    Path to the signing .pfx. Default "$HOME\.pane\pane-codesign.pfx". A
    self-signed cert is generated here on first run.

.PARAMETER Register
    After signing, register the package via Add-AppxPackage -ExternalLocation.

.PARAMETER ExternalLocation
    Install dir of pane.exe to bind identity to. Required with -Register.
    Defaults to the local release build dir (target/release).
#>

[CmdletBinding()]
param(
    [string]$Version,
    [string]$Publisher = "CN=Pane",
    [string]$PfxPath = "$HOME\.pane\pane-codesign.pfx",
    [switch]$Register,
    [string]$ExternalLocation,
    [switch]$StageBundle
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($m) { Write-Host "error: $m" -ForegroundColor Red; exit 1 }
function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }

# ---- locate Windows SDK tools ----------------------------------------------

function Find-SdkTool($name) {
    $bin = "C:\Program Files (x86)\Windows Kits\10\bin"
    if (-not (Test-Path $bin)) { Fail "Windows SDK bin not found at $bin." }
    $dirs = Get-ChildItem $bin -Directory | Where-Object { $_.Name -match '^10\.' } |
        Sort-Object Name -Descending
    foreach ($d in $dirs) {
        $p = Join-Path $d.FullName "x64\$name"
        if (Test-Path $p) { return $p }
    }
    Fail "$name not found under any Windows SDK in $bin (install the Windows SDK)."
}

$makeappx = Find-SdkTool "makeappx.exe"
$signtool = Find-SdkTool "signtool.exe"

# ---- resolve version -------------------------------------------------------

if (-not $Version) {
    $conf = Get-Content -Raw "src-tauri/tauri.conf.json" | ConvertFrom-Json
    $Version = $conf.version
}
if ($Version -notmatch '^\d+\.\d+\.\d+(\.\d+)?$') { Fail "bad version '$Version'." }
$pkgVersion = $Version
if (($pkgVersion.ToCharArray() | Where-Object { $_ -eq '.' }).Count -eq 2) {
    $pkgVersion = "$pkgVersion.0"   # MSIX requires 4-part versions
}

# ---- stage package contents ------------------------------------------------

$staging = Join-Path $env:TEMP "pane-identity-stage"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null
New-Item -ItemType Directory -Path (Join-Path $staging "Assets") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $staging "public") | Out-Null

Step "staging manifest (version $pkgVersion)"
$manifest = Get-Content -Raw "src-tauri/identity/AppxManifest.xml"
$manifest = [regex]::Replace($manifest, '(<Identity[^>]*\bVersion=")[^"]*(")', "`${1}$pkgVersion`${2}")
[System.IO.File]::WriteAllText((Join-Path $staging "AppxManifest.xml"), $manifest)

$icons = "src-tauri/icons"
Copy-Item (Join-Path $icons "StoreLogo.png")        (Join-Path $staging "Assets\StoreLogo.png")
Copy-Item (Join-Path $icons "Square150x150Logo.png") (Join-Path $staging "Assets\Square150x150Logo.png")
Copy-Item (Join-Path $icons "Square44x44Logo.png")   (Join-Path $staging "Assets\Square44x44Logo.png")

# ---- pack ------------------------------------------------------------------

$outDir = Join-Path $root "src-tauri/target/release/bundle/identity"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$msix = Join-Path $outDir "Pane-$pkgVersion.msix"

Step "packing $msix"
& $makeappx pack /o /d $staging /nv /p $msix
if ($LASTEXITCODE -ne 0) { Fail "makeappx failed." }

# ---- certificate -----------------------------------------------------------

if (-not (Test-Path $PfxPath)) {
    Step "no signing cert at $PfxPath - generating self-signed (dev only)"
    $pfxDir = Split-Path -Parent $PfxPath
    if (-not (Test-Path $pfxDir)) { New-Item -ItemType Directory -Path $pfxDir | Out-Null }
    $cert = New-SelfSignedCertificate -Type Custom -Subject $Publisher `
        -KeyUsage DigitalSignature -FriendlyName "Pane Dev Code Signing" `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
    $pwd = ConvertTo-SecureString -String "pane-dev" -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath $PfxPath -Password $pwd | Out-Null
    Write-Host "  generated cert $($cert.Thumbprint)" -ForegroundColor Green
}

# Trust the public cert locally so Add-AppxPackage accepts the self-signed pkg.
# Load with the password explicitly; Get-PfxCertificate prompts interactively
# in Windows PowerShell 5.1 and would hang under -NonInteractive.
$pfx = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($PfxPath, "pane-dev")
$cerPath = [System.IO.Path]::ChangeExtension($PfxPath, ".cer")
Export-Certificate -Cert $pfx -FilePath $cerPath | Out-Null
$alreadyTrusted = Get-ChildItem Cert:\CurrentUser\TrustedPeople |
    Where-Object { $_.Thumbprint -eq $pfx.Thumbprint }
if (-not $alreadyTrusted) {
    Step "trusting signing cert in CurrentUser\TrustedPeople"
    Import-Certificate -FilePath $cerPath -CertStoreLocation Cert:\CurrentUser\TrustedPeople | Out-Null
}

Step "signing package"
& $signtool sign /fd SHA256 /f $PfxPath /p "pane-dev" $msix
if ($LASTEXITCODE -ne 0) { Fail "signtool failed (does the cert subject match the manifest Publisher '$Publisher'?)." }

Write-Host ""
Write-Host "Built + signed: $msix" -ForegroundColor Green

# ---- optional stage for NSIS bundling --------------------------------------

# Copy the signed package + public cert into src-tauri/resources/identity under
# stable names so `tauri build` bundles them and the installer hook can find
# them. Must run before `tauri build` gathers resources.
if ($StageBundle) {
    $bundleDir = Join-Path $root "src-tauri/resources/identity"
    New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null
    Copy-Item $msix    (Join-Path $bundleDir "Pane-identity.msix") -Force
    Copy-Item $cerPath (Join-Path $bundleDir "pane-codesign.cer")  -Force
    Step "staged identity package + cert -> $bundleDir"
}

# ---- optional register -----------------------------------------------------

if ($Register) {
    if (-not $ExternalLocation) {
        $ExternalLocation = Join-Path $root "src-tauri/target/release"
    }
    $ExternalLocation = (Resolve-Path $ExternalLocation).Path
    Step "registering identity package -> $ExternalLocation"
    Add-AppxPackage -Path $msix -ExternalLocation $ExternalLocation
    Write-Host "Registered. Verify with: Get-AppxPackage Pane | Format-List Name,PackageFullName,InstallLocation" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "To register against a local build for testing:" -ForegroundColor Yellow
    Write-Host "  .\scripts\build-identity-package.ps1 -Register -ExternalLocation `"$root\src-tauri\target\release`""
}
