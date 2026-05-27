<#
.SYNOPSIS
    Kill all dev instances of the Home app that may be stuck or bugged.

.DESCRIPTION
    Terminates every dev process in two families:

    Legacy (WinUI 3 / .NET):
      - Home.Hub.exe
      - dotnet.exe processes whose command line references Home.Hub

    Tauri spike (Rust + Vite):
      - home.exe  (Cargo debug binary)
      - cargo.exe / tauri.exe build/runner processes referencing this repo
      - node.exe  processes running Vite from this repo's src/ directory

.EXAMPLE
    .\scripts\stop.ps1
#>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# ---- helpers ----------------------------------------------------------------

function Write-Killing($label, $id) {
    Write-Host "  Killing $label (PID $id)..."
}

function Stop-ProcessById($id) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}

$killed = 0

# ---- 1. Home.Hub.exe --------------------------------------------------------

$hubProcs = Get-Process -Name "Home.Hub" -ErrorAction SilentlyContinue
foreach ($p in $hubProcs) {
    Write-Killing "Home.Hub.exe" $p.Id
    Stop-ProcessById $p.Id
    $killed++
}

# ---- 2. dotnet.exe hosting Home.Hub -----------------------------------------

Get-CimInstance Win32_Process -Filter "Name = 'dotnet.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*Home.Hub*" } |
    ForEach-Object {
        Write-Killing "dotnet.exe (Home.Hub)" $_.ProcessId
        Stop-ProcessById $_.ProcessId
        $killed++
    }

# ---- 3. home.exe (Tauri debug binary) ----------------------------------------

$homeProcs = Get-Process -Name "home" -ErrorAction SilentlyContinue
foreach ($p in $homeProcs) {
    # Guard: only kill if the binary lives inside this repo's target/ tree
    try {
        $exePath = $p.MainModule.FileName
    } catch {
        $exePath = ""
    }
    if ($exePath -like "*$root*" -or $exePath -eq "") {
        Write-Killing "home.exe (Tauri)" $p.Id
        Stop-ProcessById $p.Id
        $killed++
    }
}

# ---- 4. cargo.exe / tauri dev runner ----------------------------------------

Get-CimInstance Win32_Process -Filter "Name = 'cargo.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -like "*$root*" -or
        $_.CommandLine -like "*home*tauri*" -or
        $_.CommandLine -like "*tauri*home*"
    } |
    ForEach-Object {
        Write-Killing "cargo.exe (tauri dev)" $_.ProcessId
        Stop-ProcessById $_.ProcessId
        $killed++
    }

# ---- 5. node.exe running Vite from this repo --------------------------------

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$root*" } |
    ForEach-Object {
        Write-Killing "node.exe (Vite)" $_.ProcessId
        Stop-ProcessById $_.ProcessId
        $killed++
    }

# ---- 6. Wait for the Home.Hub single-instance mutex to clear ----------------

$mutexName = "Local\Home_Hub_SingleInstance_v2"
$deadline   = [datetime]::UtcNow.AddSeconds(8)
$mutexClear = $false

while ([datetime]::UtcNow -lt $deadline) {
    try {
        $mutex = [System.Threading.Mutex]::OpenExisting($mutexName)
        $mutex.Dispose()
        Start-Sleep -Milliseconds 200
    } catch [System.Threading.WaitHandleCannotBeOpenedException] {
        $mutexClear = $true
        break
    } catch {
        Start-Sleep -Milliseconds 200
    }
}

# ---- summary ----------------------------------------------------------------

if ($killed -eq 0) {
    Write-Host "No dev instances found -- nothing to kill."
} else {
    Write-Host ""
    Write-Host "Stopped $killed process(es)."
    if (-not $mutexClear) {
        Write-Warning "Home.Hub single-instance mutex may still be held. Re-run if the app fails to start."
    }
}
