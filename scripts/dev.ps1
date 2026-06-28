<#
.SYNOPSIS
    Start Pane dev (Tauri + Vite) as a single instance.

.DESCRIPTION
    Ensures only one dev session runs at a time for this repo:

      1. Acquire a repo-scoped named mutex so concurrent `pnpm run dev` calls
         cannot race into parallel `tauri dev` invocations.
      2. If another wrapper holds the mutex, stop the existing dev tree and
         wait for the mutex to become available.
      3. Always stop any leftover dev processes (pane, cargo, node) before
         starting fresh.
      4. Run the local Tauri CLI (blocking).

    Prefer this over raw `tauri dev` or `vite`.

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

function Get-ProcessCommandLine($id) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $id" -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        return ""
    }
    return [string]$process.CommandLine
}

function Assert-DevPortAvailable {
    $listeners = @(
        Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )

    if ($listeners.Count -eq 0) {
        return
    }

    $details = $listeners | ForEach-Object {
        $commandLine = Get-ProcessCommandLine $_
        "PID ${_}: $commandLine"
    }

    Fail "Port 8081 is still in use after dev cleanup. Stop that process or run pnpm run stop in the owning checkout.`n$($details -join "`n")"
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
    # The Tauri CLI is hoisted to the workspace-root node_modules, but it must
    # run from the Windows app dir so it finds apps/windows/tauri/tauri.conf.json
    # and runs the before-commands against apps/windows.
    $tauriCli = Join-Path $root "apps/windows/node_modules/@tauri-apps/cli/tauri.js"
    if (-not (Test-Path $tauriCli)) {
        Fail "Tauri CLI not installed. Run pnpm install first."
    }
    $appDir = Join-Path $root "apps\windows"

    # Merge a dev-only identifier override (pane.dev) over the base config
    # (pane.prod). The single-instance lock keys on the identifier, so a distinct
    # dev identity lets the dev build run alongside an installed release.
    $devConfig = Join-Path $appDir "tauri\tauri.conf.dev.json"

    $node = Get-Command "node.exe" -ErrorAction SilentlyContinue
    if ($null -eq $node) {
        $node = Get-Command "node" -ErrorAction Stop
    }

    $command = 'cd /d "' + $appDir + '" && "' + $node.Source + '" "' + $tauriCli + '" dev --config "' + $devConfig + '" 2>&1'
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
    Assert-DevPortAvailable
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
