<#
.SYNOPSIS
    Register the Pane sparse identity package against an installed pane.exe.

.DESCRIPTION
    Run by the NSIS installer's POSTINSTALL hook. Trusts the bundled signing
    cert (LocalMachine\TrustedPeople, and LocalMachine\Root for self-signed
    certs, why the installer must run per-machine) then binds the identity
    package to the install dir via -ExternalLocation, which is what gives
    pane.exe Windows package identity and lists it under Settings -> Dynamic
    Lighting -> Background light control.

    Co-located files (same folder as this script, all bundled as resources):
      pane-codesign.cer   public signing cert
      Pane-identity.msix  signed sparse identity package

    Failures are non-fatal: Dynamic Lighting is optional and must never block
    the install from completing.
#>

param([Parameter(Mandatory = $true)][string]$InstallDir)

$ErrorActionPreference = "SilentlyContinue"
$here = $PSScriptRoot

function Import-IfMissing {
    param(
        [string]$CertificatePath,
        [string]$StoreLocation,
        [string]$Thumbprint
    )

    $alreadyTrusted = Get-ChildItem $StoreLocation |
        Where-Object { $_.Thumbprint -eq $Thumbprint }
    if (-not $alreadyTrusted) {
        Import-Certificate -FilePath $CertificatePath -CertStoreLocation $StoreLocation | Out-Null
    }
}

$cer = Join-Path $here "pane-codesign.cer"
if (Test-Path $cer) {
    $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($cer)
    Import-IfMissing -CertificatePath $cer -StoreLocation Cert:\LocalMachine\TrustedPeople -Thumbprint $cert.Thumbprint
    if ($cert.Subject -eq $cert.Issuer) {
        Import-IfMissing -CertificatePath $cer -StoreLocation Cert:\LocalMachine\Root -Thumbprint $cert.Thumbprint
    }
}

$msix = Join-Path $here "Pane-identity.msix"
if (Test-Path $msix) {
    Add-AppxPackage -Path $msix -ExternalLocation $InstallDir
}
