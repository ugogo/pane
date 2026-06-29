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

# If the caller didn't already specify an increment/version, prompt for one here
# and then run release-it in --ci mode so every confirmation ("Commit? Tag? Push?
# Create a release on GitHub?") is auto-accepted instead of asked one by one.
$knownIncrements = @("patch", "minor", "major", "premajor", "preminor", "prepatch", "prerelease")
$hasIncrement = $false
foreach ($arg in $ReleaseItArgs) {
    if (-not $arg.StartsWith("-") -and ($knownIncrements -contains $arg -or $arg -match '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$')) {
        $hasIncrement = $true
        break
    }
}
$hasCi = $ReleaseItArgs -contains "--ci" -or $ReleaseItArgs -contains "--no-ci"

if (-not $hasIncrement) {
    Write-Host ""
    Write-Host "Select a version increment:" -ForegroundColor Cyan
    Write-Host "  [1] patch"
    Write-Host "  [2] minor"
    Write-Host "  [3] major"
    $choice = Read-Host "Choice (1-3)"
    switch ($choice.Trim()) {
        "1" { $increment = "patch" }
        "2" { $increment = "minor" }
        "3" { $increment = "major" }
        default {
            Write-Host "error: invalid choice '$choice'; expected 1, 2, or 3." -ForegroundColor Red
            exit 1
        }
    }
    $ReleaseItArgs = @($increment) + $ReleaseItArgs
    $hasIncrement = $true
}

# Auto-confirm the rest of the flow once an increment is known.
if ($hasIncrement -and -not $hasCi) {
    $ReleaseItArgs += "--ci"
}

& npx release-it @ReleaseItArgs
exit $LASTEXITCODE
