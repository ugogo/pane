<#
.SYNOPSIS
    Unregister the Pane sparse identity package on uninstall.

.DESCRIPTION
    Run by the NSIS installer's PREUNINSTALL hook. Removes the registered
    identity package and the self-signed signing cert trusted at install time.
    Failures are non-fatal so they never block the uninstall.
#>

$ErrorActionPreference = "SilentlyContinue"

Get-AppxPackage -Name Pane | Remove-AppxPackage

Get-ChildItem Cert:\LocalMachine\TrustedPeople |
    Where-Object { $_.Subject -eq "CN=Pane" } |
    Remove-Item -Force

Get-ChildItem Cert:\LocalMachine\Root |
    Where-Object { $_.Subject -eq "CN=Pane" } |
    Remove-Item -Force
