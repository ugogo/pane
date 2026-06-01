<#
.SYNOPSIS
    Start Pane dev (Tauri + Vite) as a single instance.

.DESCRIPTION
    Ensures only one dev session runs at a time for this repo:

      1. Acquire a repo-scoped named mutex so concurrent `npm run dev` calls
         cannot race into parallel `tauri dev` invocations.
      2. If another wrapper holds the mutex, stop the existing dev tree and
         wait for the mutex to become available.
      3. Always stop any leftover dev processes (pane, cargo, node) before
         starting fresh.
      4. Run the local Tauri CLI (blocking).

    Prefer this over raw `tauri dev` or `npx vite`.

.EXAMPLE
    .\scripts\dev.ps1
#>

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($message) {
    Write-Error $message
    exit 1
}

function Get-DevMutexName {
    $hash = [System.BitConverter]::ToString(
        [System.Security.Cryptography.SHA256]::Create().ComputeHash(
            [System.Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant())
        )
    ).Replace("-", "").ToLowerInvariant()
    return "Global\PaneDev-$hash"
}

function Invoke-StopDev {
    & (Join-Path $PSScriptRoot "stop.ps1")
    if (-not $?) { Fail "stop failed" }
}

function Add-WebView2BrowserArgument {
    param([string]$Argument)

    $name = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"
    $current = [Environment]::GetEnvironmentVariable($name, "Process")
    if ([string]::IsNullOrWhiteSpace($current)) {
        [Environment]::SetEnvironmentVariable($name, $Argument, "Process")
        return
    }

    $escaped = [regex]::Escape($Argument)
    if ($current -notmatch "(^|\s)$escaped($|\s)") {
        [Environment]::SetEnvironmentVariable($name, "$current $Argument", "Process")
    }
}

function Invoke-TauriDev {
    $tauriCli = Join-Path $root "node_modules/@tauri-apps/cli/tauri.js"
    if (-not (Test-Path $tauriCli)) {
        Fail "Tauri CLI not installed. Run npm install first."
    }

    $node = Get-Command "node.exe" -ErrorAction SilentlyContinue
    if ($null -eq $node) {
        $node = Get-Command "node" -ErrorAction Stop
    }

    $command = '"' + $node.Source + '" "' + $tauriCli + '" dev 2>&1'
    & cmd.exe /d /s /c $command | ForEach-Object {
        $line = $_.ToString()
        if ($line -notlike "*STATUS_CONTROL_C_EXIT*") {
            [Console]::Out.WriteLine($line)
        }
    }
    return $LASTEXITCODE
}

function Acquire-DevMutex {
    param(
        [System.Threading.Mutex]$Mutex,
        [int]$TimeoutMs
    )
    try {
        return $Mutex.WaitOne($TimeoutMs)
    } catch [System.Threading.AbandonedMutexException] {
        return $true
    }
}

$mutexName = Get-DevMutexName
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
$acquired = $false

try {
    if (-not (Acquire-DevMutex -Mutex $mutex -TimeoutMs 0)) {
        Invoke-StopDev
        if (-not (Acquire-DevMutex -Mutex $mutex -TimeoutMs 30000)) {
            Fail "dev lock timeout"
        }
    }
    $acquired = $true

    Invoke-StopDev
    Add-WebView2BrowserArgument "--disable-logging"

    $exitCode = Invoke-TauriDev
    exit $exitCode
} finally {
    if ($acquired) {
        try {
            $mutex.ReleaseMutex()
        } catch {
            # Mutex already released or not owned; safe to ignore on exit.
        }
    }
    $mutex.Dispose()
}
