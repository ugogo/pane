<#
.SYNOPSIS
    Cut a release end to end: bump versions, build + sign, tag, and publish to
    GitHub Releases.

.DESCRIPTION
    Replaces the old tag-triggered CI workflow with a single local script:

      1. Bumps the version across package.json (+lockfile), src-tauri/Cargo.toml,
         src-tauri/Cargo.lock, and src-tauri/tauri.conf.json.
      2. Builds the signed NSIS installer via `tauri build` (the build also runs
         tsc + vite, so it doubles as the verification gate).

    Two independent signatures are involved, do not conflate them:
      - Updater signing: a minisign signature over the installer (the `.sig`
         the auto-updater verifies). Uses the key in -SigningKey /
         TAURI_SIGNING_PRIVATE_KEY.
      - Authenticode / MSIX code signing: signs the Dynamic Lighting identity
         package (.msix) and is what Windows trusts. Pane is a personal app and
         signs this self-signed automatically — no cert, no flag, nothing to set
         up. The installer's POSTINSTALL hook trusts the bundled public cert
         per-machine so the package registers. (If Pane ever needs a real CA
         cert, call build-identity-package.ps1 directly without -DevSelfSigned.)
      3. Generates latest.json (the manifest the app's updater polls at
         releases/latest/download/latest.json).
      4. Commits "chore(release): vX.Y.Z" and creates the tag.
      5. After showing the commits and confirming, pushes the branch + tag and
         creates the GitHub release, uploading the installer, its .sig, and
         latest.json.

    Requires: `gh` authenticated, and the updater signing key (see -SigningKey).

.PARAMETER Version
    Target version: an explicit semver ("0.2.0") or a bump keyword
    ("patch" | "minor" | "major"). Defaults to "patch", so a bare
    `.\scripts\release.ps1` cuts the next patch release.

.PARAMETER DryRun
    Print the resolved version, the commits, and the planned steps without
    touching files, building, or publishing.

.PARAMETER NoPublish
    Do everything locally (bump, build, sign, commit, tag) but do not push or
    create the GitHub release. Useful for verifying a build before releasing.

.PARAMETER Yes
    Skip the interactive confirmation before pushing/publishing.

.PARAMETER SigningKey
    Path to the updater minisign private key. Defaults to
    "$HOME\.tauri\pane-updater.key". Ignored if TAURI_SIGNING_PRIVATE_KEY is
    already set in the environment.

.EXAMPLE
    .\scripts\release.ps1                      # cut the next patch release

.EXAMPLE
    .\scripts\release.ps1 0.2.0

.EXAMPLE
    .\scripts\release.ps1 minor -NoPublish    # build + tag locally, don't publish

.EXAMPLE
    .\scripts\release.ps1 patch -Yes
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Version = "patch",
    [switch]$DryRun,
    [switch]$NoPublish,
    [switch]$Yes,
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

function Test-NpmConfigFlag($name) {
    $value = [Environment]::GetEnvironmentVariable("npm_config_$name")
    return $value -and $value -ne "false"
}

if (-not $DryRun -and (Test-NpmConfigFlag "dryrun")) {
    $DryRun = $true
    Write-Host "notice: npm swallowed -DryRun; treating it as -DryRun. Prefer: npm run release -- -DryRun" -ForegroundColor Yellow
}
if (-not $NoPublish -and (Test-NpmConfigFlag "nopublish")) {
    $NoPublish = $true
    Write-Host "notice: npm swallowed -NoPublish; treating it as -NoPublish. Prefer: npm run release -- -NoPublish" -ForegroundColor Yellow
}
if (-not $Yes -and (Test-NpmConfigFlag "yes")) {
    $Yes = $true
    Write-Host "notice: npm swallowed -Yes; treating it as -Yes. Prefer: npm run release -- -Yes" -ForegroundColor Yellow
}
Remove-Item Env:npm_config_dryrun, Env:npm_config_nopublish, Env:npm_config_yes -ErrorAction SilentlyContinue

# Replace the first regex match in a file, preserving its exact formatting and
# line endings. Fails loudly if the pattern is not found.
function Set-FirstMatch($path, $pattern, $replacement, $label) {
    $raw = Get-Content -LiteralPath $path -Raw
    $updated = ([regex]$pattern).Replace($raw, $replacement, 1)
    if ($updated -eq $raw) { Fail "could not update version in $label ($path)." }
    [System.IO.File]::WriteAllText($path, $updated)
}

# Print the commits this release will contain (everything since the previous v*
# tag, or the whole history if there is none).
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

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Fail "the GitHub CLI 'gh' is required to publish releases."
}

$remote = (git remote get-url origin).Trim()
$slug = $remote -replace '^git@github\.com:', '' -replace '^https://github\.com/', '' -replace '\.git$', ''

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

# Resolve the previous release tag now, before we create the new one. `git
# describe` writes to stderr when there are no tags; redirecting that under a
# Stop preference would terminate the script, so relax it for this one call.
$prevTag = $null
$savedEap = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
$describe = git describe --tags --abbrev=0 --match "v*" 2>$null
$ErrorActionPreference = $savedEap
if ($LASTEXITCODE -eq 0 -and $describe) {
    $prevTag = ($describe | Select-Object -First 1).ToString().Trim()
}

Step "release $current -> $new  (tag $tag)"

if ($DryRun) {
    Show-ReleaseCommits $prevTag
    Write-Host "[dry-run] would:"
    Write-Host "  - bump package.json, Cargo.toml, Cargo.lock, tauri.conf.json to $new"
    Write-Host "  - build + sign the NSIS installer (npx tauri build)"
    Write-Host "  - generate latest.json"
    Write-Host "  - commit 'chore(release): $tag', create tag $tag"
    if ($NoPublish) {
        Write-Host "  - stop (NoPublish): no push, no GitHub release"
    } else {
        Write-Host "  - push $branch and $tag, then create the GitHub release"
    }
    exit 0
}

# ---- resolve the signing key ------------------------------------------------

if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    if (-not (Test-Path -LiteralPath $SigningKey)) {
        Fail "updater signing key not found at '$SigningKey'. Set -SigningKey or the TAURI_SIGNING_PRIVATE_KEY env var."
    }
    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath $SigningKey -Raw
}
if ($null -eq $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    # Tauri treats this as the updater signing key password. Use an empty
    # password only when the key was generated that way; otherwise set
    # TAURI_SIGNING_PRIVATE_KEY_PASSWORD before running this script.
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
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
# touch an unrelated crate that also happens to be named "pane".
Step "bumping src-tauri/Cargo.lock"
Set-FirstMatch "src-tauri/Cargo.lock" `
    ('(name = "pane"\r?\nversion = ")' + [regex]::Escape($current) + '(")') `
    ('${1}' + $new + '${2}') "Cargo.lock"

# ---- stage Dynamic Lighting identity package --------------------------------

# Build + sign the sparse identity package and stage it (with its public cert)
# into src-tauri/resources/identity so `tauri build` bundles it. The installer
# hook registers it on install, giving pane.exe package identity for background
# Dynamic Lighting control. Runs after the version bump so the package version
# (read from tauri.conf.json) matches the release.
Step "building + signing Dynamic Lighting identity package (self-signed)"
# Pane is a personal app and signs the identity package self-signed: the cert is
# generated on first run, and the installer's POSTINSTALL hook trusts the bundled
# public cert per-machine so the package registers. No cert or env var to set up.
& (Join-Path $PSScriptRoot "build-identity-package.ps1") -StageBundle -DevSelfSigned
if ($LASTEXITCODE -ne 0) { Fail "identity package build failed." }

# ---- build + sign -----------------------------------------------------------

Step "building + signing installer (npx tauri build)"
npx tauri build --ci
if ($LASTEXITCODE -ne 0) {
    Fail "tauri build failed. Version files left modified; run 'git checkout -- package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json' to revert."
}

$nsisDir = Join-Path $root "src-tauri/target/release/bundle/nsis"
$installer = Get-ChildItem -LiteralPath $nsisDir -Filter "*$new*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $installer) { Fail "could not find the $new installer in $nsisDir." }
$sigPath = "$($installer.FullName).sig"
if (-not (Test-Path -LiteralPath $sigPath)) { Fail "installer signature not found at $sigPath (is createUpdaterArtifacts enabled?)." }

# ---- generate latest.json ---------------------------------------------------

Step "generating latest.json"
$signature = (Get-Content -LiteralPath $sigPath -Raw).Trim()
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$downloadUrl = "https://github.com/$slug/releases/download/$tag/$($installer.Name)"
$manifest = [ordered]@{
    version   = $new
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

# ---- confirm ----------------------------------------------------------------

Show-ReleaseCommits $prevTag
Write-Host "Built: $($installer.Name)" -ForegroundColor Green

if ($NoPublish) {
    Write-Host ""
    Write-Host "NoPublish: built, committed, and tagged locally. To publish later:"
    Write-Host "  git push origin $branch; git push origin $tag"
    Write-Host "  gh release create $tag `"$($installer.FullName)`" `"$sigPath`" `"$latestPath`" --title `"Pane $tag`" --latest"
    exit 0
}

if (-not $Yes) {
    $ans = Read-Host "Push '$branch' + tag '$tag' and publish the GitHub release? (y/N)"
    if ($ans -ne "y" -and $ans -ne "Y") {
        Write-Host ""
        Write-Host "Not published. The commit, tag, and build exist locally. To finish later:"
        Write-Host "  git push origin $branch; git push origin $tag"
        Write-Host "  gh release create $tag `"$($installer.FullName)`" `"$sigPath`" `"$latestPath`" --title `"Pane $tag`" --latest"
        Write-Host "Or to undo the commit + tag:"
        Write-Host "  git tag -d $tag; git reset --hard HEAD~1"
        exit 0
    }
}

# ---- push + publish ---------------------------------------------------------

Step "pushing $branch and $tag"
git push origin $branch
if ($LASTEXITCODE -ne 0) { Fail "git push (branch) failed." }
git push origin $tag
if ($LASTEXITCODE -ne 0) { Fail "git push (tag) failed." }

# Build the GitHub release notes from the commit log.
if ($prevTag) { $range = "$prevTag..HEAD" } else { $range = "HEAD" }
$changes = git log --pretty="- %s" --no-merges $range |
    Where-Object { $_ -notmatch '^- chore\(release\):' }
$notesBody = "Download the installer below. Existing installs update automatically."
if ($changes) {
    $notesBody += "`n`n## Changes`n" + ($changes -join "`n")
}
$notesFile = Join-Path $env:TEMP "pane-release-notes-$new.md"
[System.IO.File]::WriteAllText($notesFile, $notesBody)

Step "creating GitHub release $tag"
gh release create $tag "$($installer.FullName)" "$sigPath" "$latestPath" `
    --title "Pane $tag" --notes-file "$notesFile" --latest
if ($LASTEXITCODE -ne 0) { Fail "gh release create failed (tag is pushed; re-run the gh command to retry)." }

Write-Host ""
Write-Host "Released $tag." -ForegroundColor Green
Write-Host "  https://github.com/$slug/releases/tag/$tag"
