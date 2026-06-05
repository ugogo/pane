<#
.SYNOPSIS
    Kill all dev instances of the Pane app that may be stuck or bugged.

.DESCRIPTION
    Terminates every dev process in the Tauri (Rust + Metro) family:
      - pane.exe  (Cargo debug binary)
      - cargo.exe / tauri.exe build/runner processes referencing this repo
      - node.exe  processes running Expo/Metro from this repo

.EXAMPLE
    .\scripts\stop.ps1
#>

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot

function Stop-ProcessById($id) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}

function Get-ProcessCommandLine($id) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $id" -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        return ""
    }
    return [string]$process.CommandLine
}

function Stop-RepoPortListener {
    param([int]$Port)

    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object {
            $commandLine = Get-ProcessCommandLine $_
            if (
                $commandLine -like "*$root*" -and
                ($commandLine -like "*expo*" -or $commandLine -like "*metro*" -or $commandLine -like "*node_modules*")
            ) {
                Stop-ProcessById $_
            }
        }
}

Get-Process -Name "pane" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $exePath = $_.MainModule.FileName
    } catch {
        $exePath = ""
    }
    if ($exePath -like "*$root*" -or $exePath -eq "") {
        Stop-ProcessById $_.Id
    }
}

Get-CimInstance Win32_Process -Filter "Name = 'cargo.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -like "*$root*" -or
        $_.CommandLine -like "*pane*tauri*" -or
        $_.CommandLine -like "*tauri*pane*"
    } |
    ForEach-Object { Stop-ProcessById $_.ProcessId }

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$root*" } |
    ForEach-Object { Stop-ProcessById $_.ProcessId }

Stop-RepoPortListener -Port 8081
