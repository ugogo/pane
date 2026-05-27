<#
.SYNOPSIS
    Kill all dev instances of the Home app that may be stuck or bugged.

.DESCRIPTION
    Terminates every dev process in the Tauri (Rust + Vite) family:
      - home.exe  (Cargo debug binary)
      - cargo.exe / tauri.exe build/runner processes referencing this repo
      - node.exe  processes running Vite from this repo's src/ directory

.EXAMPLE
    .\scripts\stop.ps1
#>

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot

# ---- helpers ----------------------------------------------------------------

function Write-Killing($label, $id) {
    Write-Host "  Killing $label (PID $id)..."
}

function Stop-ProcessById($id) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}

$killed = 0

# ---- 1. home.exe (Tauri debug binary) ----------------------------------------

$homeProcs = Get-Process -Name "home" -ErrorAction SilentlyContinue
foreach ($p in $homeProcs) {
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

# ---- 2. cargo.exe / tauri dev runner ----------------------------------------

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

# ---- 3. node.exe running Vite from this repo --------------------------------

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$root*" } |
    ForEach-Object {
        Write-Killing "node.exe (Vite)" $_.ProcessId
        Stop-ProcessById $_.ProcessId
        $killed++
    }

# ---- summary ----------------------------------------------------------------

if ($killed -eq 0) {
    Write-Host "No dev instances found -- nothing to kill."
} else {
    Write-Host ""
    Write-Host "Stopped $killed process(es)."
}
