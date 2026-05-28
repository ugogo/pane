<#
.SYNOPSIS
    Cut a release: bump the version across every manifest, commit, tag, and push.

.DESCRIPTION
    The Release workflow (.github/workflows/release.yml) fires on a `vX.Y.Z` tag.
    This keeps the version in sync across the files that must agree for the build
    and the auto-updater to work, then creates and (optionally) pushes that tag:
      - package.json + package-lock.json
      - src-tauri/Cargo.toml + src-tauri/Cargo.lock
      - src-tauri/tauri.conf.json   (the installer + latest.json version the
                                      app's updater compares against)

    Pushing the tag triggers the build that signs the installer and publishes
    the GitHub release. Nothing is pushed until you confirm (or pass -Yes).

.PARAMETER Version
    Target version: an explicit semver like "0.2.0", or a bump keyword
    ("patch" | "minor" | "major") computed from the current version.

.PARAMETER SkipChecks
    Skip the local "npm run typecheck" + "cargo check" sanity gate.

.PARAMETER DryRun
    Print the resolved version and planned steps without touching files or git.

.PARAMETER Yes
    Push without the interactive confirmation prompt.

.EXAMPLE
    .\scripts\release.ps1 0.2.0

.EXAMPLE
    .\scripts\release.ps1 minor

.EXAMPLE
    .\scripts\release.ps1 patch -SkipChecks -Yes
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Version,
    [switch]$SkipChecks,
    [switch]$DryRun,
    [switch]$Yes
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

# Print the commits that this release will contain (everything since the
# previous v* tag, or the whole history if there is none).
function Show-ReleaseCommits($prevTag) {
    Write-Host ""
    if ($prevTag) {
        Write-Host "Commits in this release (since $prevTag):" -ForegroundColor Cyan
        $range = "$prevTag..HEAD"
    } else {
        Write-Host "Commits in this release (no prior release tag):" -ForegroundColor Cyan
        $range = "HEAD"
    }
    $lines = git log --oneline --no-merges $range
    if ($lines) {
        $lines | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Host "  (none)"
    }
    Write-Host ""
}

# Replace the first regex match in a file, preserving its exact formatting and
# line endings. Fails loudly if the pattern is not found.
function Set-FirstMatch($path, $pattern, $replacement, $label) {
    $raw = Get-Content -LiteralPath $path -Raw
    $updated = ([regex]$pattern).Replace($raw, $replacement, 1)
    if ($updated -eq $raw) { Fail "could not update version in $label ($path)." }
    [System.IO.File]::WriteAllText($path, $updated)
}

# ---- pre-flight -------------------------------------------------------------

git rev-parse --git-dir | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "not inside a git repository." }

if (git status --porcelain) {
    Fail "working tree is not clean. Commit or stash changes before releasing."
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne "main") {
    Write-Host "warning: on '$branch', not 'main' - releases normally cut from main." -ForegroundColor Yellow
}

# ---- resolve target version -------------------------------------------------

$semverRe = '^\d+\.\d+\.\d+$'
$current = (node -p "require('./package.json').version").Trim()

if ($Version -match $semverRe) {
    $new = $Version
} elseif (@("patch", "minor", "major") -contains $Version) {
    $parts = $current.Split('.')
    $maj = [int]$parts[0]; $min = [int]$parts[1]; $pat = [int]$parts[2]
    switch ($Version) {
        "major" { $maj++; $min = 0; $pat = 0 }
        "minor" { $min++; $pat = 0 }
        "patch" { $pat++ }
    }
    $new = "$maj.$min.$pat"
} else {
    Fail "Version must be a semver like 0.2.0 or one of: patch, minor, major."
}

if ($new -eq $current) { Fail "target version $new matches the current version." }

$tag = "v$new"
git rev-parse -q --verify "refs/tags/$tag" | Out-Null
if ($LASTEXITCODE -eq 0) { Fail "tag $tag already exists." }

# Resolve the previous release tag now, before we create the new one.
$prevTag = git describe --tags --abbrev=0 --match "v*" 2>$null
if ($LASTEXITCODE -ne 0 -or -not $prevTag) { $prevTag = $null } else { $prevTag = $prevTag.Trim() }

Step "release $current -> $new  (tag $tag)"

if ($DryRun) {
    Show-ReleaseCommits $prevTag
    Write-Host "[dry-run] would:"
    Write-Host "  - bump package.json, Cargo.toml, Cargo.lock, tauri.conf.json to $new"
    if (-not $SkipChecks) { Write-Host "  - run npm run typecheck + cargo check" }
    Write-Host "  - commit 'chore(release): $tag', create tag $tag"
    Write-Host "  - push $branch and $tag to origin"
    exit 0
}

# ---- bump versions ----------------------------------------------------------

Step "bumping package.json + package-lock.json"
npm version $new --no-git-tag-version | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "npm version failed." }

Step "bumping src-tauri/Cargo.toml"
Set-FirstMatch "src-tauri/Cargo.toml" '(?m)^version\s*=\s*"[^"]*"' ('version = "{0}"' -f $new) "Cargo.toml"

Step "bumping src-tauri/tauri.conf.json"
Set-FirstMatch "src-tauri/tauri.conf.json" '"version"\s*:\s*"[^"]*"' ('"version": "{0}"' -f $new) "tauri.conf.json"

# Scope the lockfile edit to the entry matching the OLD version so we never
# touch an unrelated crate that also happens to be named "home".
Step "bumping src-tauri/Cargo.lock"
Set-FirstMatch "src-tauri/Cargo.lock" `
    ('(name = "home"\r?\nversion = ")' + [regex]::Escape($current) + '(")') `
    ('${1}' + $new + '${2}') "Cargo.lock"

# ---- sanity gate ------------------------------------------------------------

if (-not $SkipChecks) {
    Step "npm run typecheck"
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { Fail "typecheck failed - version files left modified for inspection." }

    Step "cargo check"
    cargo check --manifest-path src-tauri/Cargo.toml
    if ($LASTEXITCODE -ne 0) { Fail "cargo check failed - version files left modified for inspection." }
}

# ---- commit + tag -----------------------------------------------------------

Step "committing release"
$files = @(
    "package.json",
    "package-lock.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/tauri.conf.json"
) | Where-Object { Test-Path $_ }
git add -- $files
if ($LASTEXITCODE -ne 0) { Fail "git add failed." }
git commit -m "chore(release): $tag"
if ($LASTEXITCODE -ne 0) { Fail "git commit failed." }
git tag -a $tag -m "Release $tag"
if ($LASTEXITCODE -ne 0) { Fail "git tag failed." }

# ---- push -------------------------------------------------------------------

Show-ReleaseCommits $prevTag

if (-not $Yes) {
    $ans = Read-Host "Push '$branch' and tag '$tag' to origin? This starts the release build (y/N)"
    if ($ans -ne "y" -and $ans -ne "Y") {
        Write-Host ""
        Write-Host "Not pushed. The commit and tag exist locally. To release later:"
        Write-Host "  git push origin $branch; git push origin $tag"
        Write-Host "Or to undo:"
        Write-Host "  git tag -d $tag; git reset --hard HEAD~1"
        exit 0
    }
}

Step "pushing $branch and $tag"
git push origin $branch
if ($LASTEXITCODE -ne 0) { Fail "git push (branch) failed." }
git push origin $tag
if ($LASTEXITCODE -ne 0) { Fail "git push (tag) failed." }

$remote = (git remote get-url origin).Trim()
$slug = $remote -replace '^git@github\.com:', '' -replace '^https://github\.com/', '' -replace '\.git$', ''

Write-Host ""
Write-Host "Released $tag." -ForegroundColor Green
Write-Host "  Build: https://github.com/$slug/actions/workflows/release.yml"
