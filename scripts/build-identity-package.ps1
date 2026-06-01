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
      2. Stage the manifest + logo assets (from apps/windows/tauri/icons) + the public
         folder into a temp build dir.
      3. Pack it with MakeAppx into target/release/bundle/identity/Pane-<ver>.msix.
      4. Ensure a code-signing cert exists (self-signed for dev) whose subject
         matches the manifest Publisher, trust its public cert locally, and sign
         the package with SignTool.
      5. Optionally register it against an install dir (-Register -ExternalLocation).

    The Publisher in identity/AppxManifest.xml and the publisher in
    apps/windows/tauri/windows-app-manifest.xml must both equal the signing cert subject
    (default CN=Pane). For distribution, replace the self-signed cert with a real
    code-signing certificate and keep all three in sync.

.PARAMETER Version
    4-part-friendly app version (e.g. 0.4.0). Defaults to tauri.conf.json.

.PARAMETER Publisher
    Certificate subject / manifest Publisher. Default "CN=Pane".

.PARAMETER PfxPath
    Path to the signing .pfx. Default "$HOME\.pane\pane-codesign.pfx". With
    -DevSelfSigned, a self-signed cert is generated here on first run.

.PARAMETER CertPassword
    Password for the signing .pfx. Falls back to the PANE_SIGNING_PFX_PASSWORD
    environment variable. For -DevSelfSigned, defaults to the throwaway dev
    password if unset.

.PARAMETER DevSelfSigned
    Opt in to generating/using a self-signed certificate. Pane currently ships
    self-signed releases as a deliberate cost tradeoff: the installer's
    POSTINSTALL hook (register-identity.ps1) imports the bundled public cert
    into LocalMachine\TrustedPeople, so the sparse package registers on end-user
    machines without a paid CA cert — at the cost of each machine trusting a
    cert generated on the build host. Without this switch the script requires an
    externally supplied signing certificate + password and fails closed on the
    dev cert/password/default path, so a release can't be cut self-signed by
    mistake.

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
    [string]$CertPassword,
    [switch]$DevSelfSigned,
    [switch]$Register,
    [string]$ExternalLocation,
    [switch]$StageBundle
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($m) { Write-Host "error: $m" -ForegroundColor Red; exit 1 }
function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }

function Use-WindowsPowerShellModulePath {
    if ($PSVersionTable.PSEdition -ne "Desktop") { return }

    $windowsModuleRoots = @(
        (Join-Path $HOME "Documents\WindowsPowerShell\Modules"),
        (Join-Path $env:ProgramFiles "WindowsPowerShell\Modules"),
        (Join-Path $PSHOME "Modules")
    )

    $env:PSModulePath = ($windowsModuleRoots |
        Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
        Select-Object -Unique) -join [System.IO.Path]::PathSeparator
}

Use-WindowsPowerShellModulePath

# The self-signed cert path + password. The password is deliberately weak; it
# only protects the local .pfx of a self-signed cert (which carries no trust of
# its own). The production path (no -DevSelfSigned) rejects them so a release
# can't be signed against the dev cert by mistake; with -DevSelfSigned they are
# used intentionally for a self-signed release.
$DevPfxPath = "$HOME\.pane\pane-codesign.pfx"
$DevPassword = "pane-dev"

# Resolve the effective PFX password: explicit param, then env var, then (only
# for dev self-signed) the throwaway dev password.
$pfxPassword = if ($CertPassword) { $CertPassword }
    elseif ($env:PANE_SIGNING_PFX_PASSWORD) { $env:PANE_SIGNING_PFX_PASSWORD }
    elseif ($DevSelfSigned) { $DevPassword }
    else { $null }

# Production guard: without -DevSelfSigned this is an externally-signed run, so
# fail closed on any sign of the dev cert/password/default path. (-DevSelfSigned
# is the supported self-signed release path; see the DevSelfSigned param docs.)
if (-not $DevSelfSigned) {
    if (-not $pfxPassword) {
        Fail "production signing requires a certificate password (set -CertPassword or the PANE_SIGNING_PFX_PASSWORD env var), or pass -DevSelfSigned for local identity testing only."
    }
    if ($pfxPassword -eq $DevPassword) {
        Fail "refusing to sign a release with the dev password '$DevPassword'. Supply a real signing certificate + password, or pass -DevSelfSigned for local testing only."
    }
    if ($PfxPath -eq $DevPfxPath) {
        Fail "refusing to use the default dev PFX path for a release. Supply -PfxPath to a production signing certificate, or pass -DevSelfSigned for local testing only."
    }
    if (-not (Test-Path $PfxPath)) {
        Fail "production signing certificate not found at '$PfxPath'."
    }
}

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
    $conf = Get-Content -Raw "apps/windows/tauri/tauri.conf.json" | ConvertFrom-Json
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
$manifest = Get-Content -Raw "apps/windows/tauri/identity/AppxManifest.xml"
$manifest = [regex]::Replace($manifest, '(<Identity[^>]*\bVersion=")[^"]*(")', "`${1}$pkgVersion`${2}")
[System.IO.File]::WriteAllText((Join-Path $staging "AppxManifest.xml"), $manifest)

$icons = "apps/windows/tauri/icons"
Copy-Item (Join-Path $icons "StoreLogo.png")        (Join-Path $staging "Assets\StoreLogo.png")
Copy-Item (Join-Path $icons "Square150x150Logo.png") (Join-Path $staging "Assets\Square150x150Logo.png")
Copy-Item (Join-Path $icons "Square44x44Logo.png")   (Join-Path $staging "Assets\Square44x44Logo.png")

# ---- pack ------------------------------------------------------------------

$outDir = Join-Path $root "apps/windows/tauri/target/release/bundle/identity"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$msix = Join-Path $outDir "Pane-$pkgVersion.msix"

Step "packing $msix"
& $makeappx pack /o /d $staging /nv /p $msix
if ($LASTEXITCODE -ne 0) { Fail "makeappx failed." }

# ---- certificate -----------------------------------------------------------

if (-not (Test-Path $PfxPath)) {
    if (-not $DevSelfSigned) {
        Fail "signing certificate not found at '$PfxPath'. Supply a production cert, or pass -DevSelfSigned to generate a throwaway dev cert."
    }
    Step "no signing cert at $PfxPath - generating self-signed (dev only)"
    $pfxDir = Split-Path -Parent $PfxPath
    if (-not (Test-Path $pfxDir)) { New-Item -ItemType Directory -Path $pfxDir | Out-Null }
    $cert = New-SelfSignedCertificate -Type Custom -Subject $Publisher `
        -KeyUsage DigitalSignature -FriendlyName "Pane Dev Code Signing" `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
    $pwd = ConvertTo-SecureString -String $pfxPassword -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath $PfxPath -Password $pwd | Out-Null
    Write-Host "  generated cert $($cert.Thumbprint)" -ForegroundColor Green
}

# Trust the public cert locally so Add-AppxPackage accepts the self-signed pkg.
# Load with the password explicitly; Get-PfxCertificate prompts interactively
# in Windows PowerShell 5.1 and would hang under -NonInteractive.
$pfx = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($PfxPath, $pfxPassword)
$cerPath = [System.IO.Path]::ChangeExtension($PfxPath, ".cer")
Export-Certificate -Cert $pfx -FilePath $cerPath | Out-Null
$alreadyTrusted = Get-ChildItem Cert:\CurrentUser\TrustedPeople |
    Where-Object { $_.Thumbprint -eq $pfx.Thumbprint }
if (-not $alreadyTrusted) {
    Step "trusting signing cert in CurrentUser\TrustedPeople"
    Import-Certificate -FilePath $cerPath -CertStoreLocation Cert:\CurrentUser\TrustedPeople | Out-Null
}

Step "signing package"
& $signtool sign /fd SHA256 /f $PfxPath /p $pfxPassword $msix
if ($LASTEXITCODE -ne 0) { Fail "signtool failed (does the cert subject match the manifest Publisher '$Publisher'?)." }

Write-Host ""
Write-Host "Built + signed: $msix" -ForegroundColor Green

# ---- optional stage for NSIS bundling --------------------------------------

# Copy the signed package + public cert into apps/windows/tauri/resources/identity under
# stable names so `tauri build` bundles them and the installer hook can find
# them. Must run before `tauri build` gathers resources.
if ($StageBundle) {
    $bundleDir = Join-Path $root "apps/windows/tauri/resources/identity"
    New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null
    Copy-Item $msix    (Join-Path $bundleDir "Pane-identity.msix") -Force
    Copy-Item $cerPath (Join-Path $bundleDir "pane-codesign.cer")  -Force
    Step "staged identity package + cert -> $bundleDir"
}

# ---- optional register -----------------------------------------------------

if ($Register) {
    if (-not $ExternalLocation) {
        $ExternalLocation = Join-Path $root "apps/windows/tauri/target/release"
    }
    $ExternalLocation = (Resolve-Path $ExternalLocation).Path
    Step "registering identity package -> $ExternalLocation"
    Add-AppxPackage -Path $msix -ExternalLocation $ExternalLocation
    Write-Host "Registered. Verify with: Get-AppxPackage Pane | Format-List Name,PackageFullName,InstallLocation" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "To register against a local build for testing:" -ForegroundColor Yellow
    Write-Host "  .\scripts\build-identity-package.ps1 -Register -ExternalLocation `"$root\apps\windows\tauri\target\release`""
}
