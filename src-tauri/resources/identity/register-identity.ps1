<#
.SYNOPSIS
    Register the Pane sparse identity package against an installed pane.exe.

.DESCRIPTION
    Run by the NSIS installer's POSTINSTALL hook. Trusts the bundled signing
    cert (LocalMachine\TrustedPeople, why the installer must run per-machine)
    then binds the identity package to the install dir via -ExternalLocation,
    which is what gives pane.exe Windows package identity and lists it under
    Settings -> Dynamic Lighting -> Background light control.

    Co-located files (same folder as this script, all bundled as resources):
      pane-codesign.cer   public signing cert
      Pane-identity.msix  signed sparse identity package

    Failures are non-fatal: Dynamic Lighting is optional and must never block
    the install from completing.
#>

param([Parameter(Mandatory = $true)][string]$InstallDir)

$ErrorActionPreference = "SilentlyContinue"
$here = $PSScriptRoot

$cer = Join-Path $here "pane-codesign.cer"
if (Test-Path $cer) {
    Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null
}

$msix = Join-Path $here "Pane-identity.msix"
if (Test-Path $msix) {
    Add-AppxPackage -Path $msix -ExternalLocation $InstallDir
}
