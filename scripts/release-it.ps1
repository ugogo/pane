<#
.SYNOPSIS
    release-it wrapper for Pane releases.

.DESCRIPTION
    release-it expects GITHUB_TOKEN for automated GitHub Releases. Local Pane
    releases already use gh auth, so this wrapper bridges that token when the
    environment variable is absent.
#>

[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ReleaseItArgs
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $env:GITHUB_TOKEN) {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Host "warning: gh not found; release-it will fall back to a web-based GitHub release." -ForegroundColor Yellow
    } else {
        $env:GITHUB_TOKEN = (gh auth token).Trim()
    }
}

& npx release-it @ReleaseItArgs
exit $LASTEXITCODE
