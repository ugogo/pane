param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$mutexName = "Local\Home_Hub_SingleInstance_v2"
$processName = "Home.Hub"

function Test-HubMutex {
    try {
        $mutex = [System.Threading.Mutex]::OpenExisting($mutexName)
        try {
            if ($mutex.WaitOne(0)) {
                $mutex.ReleaseMutex()
                return $false
            }

            return $true
        }
        catch [System.Threading.AbandonedMutexException] {
            $mutex.ReleaseMutex()
            return $false
        }
        finally {
            $mutex.Dispose()
        }
    }
    catch [System.Threading.WaitHandleCannotBeOpenedException] {
        return $false
    }
}

function Get-RunningHubProcesses {
    $processes = @()

    $hubProcesses = Get-Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessName -eq $processName }
    if ($hubProcesses) {
        $processes += $hubProcesses
    }

    Get-CimInstance Win32_Process -Filter "Name = 'dotnet.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*Home.Hub*" } |
        ForEach-Object {
            $dotnetProcess = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
            if ($dotnetProcess) {
                $processes += $dotnetProcess
            }
        }

    return @($processes | Sort-Object Id -Unique)
}

function Stop-RunningHubInstances {
    $processes = Get-RunningHubProcesses
    if ($processes.Count -eq 0) {
        return
    }

    Write-Host "Stopping $($processes.Count) running Home.Hub instance(s)..."
    foreach ($process in $processes) {
        Write-Host "  Stopping PID $($process.Id)..."
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }

    $deadline = [datetime]::UtcNow.AddSeconds(10)
    while ([datetime]::UtcNow -lt $deadline) {
        if ((Get-RunningHubProcesses).Count -eq 0 -and -not (Test-HubMutex)) {
            return
        }

        Start-Sleep -Milliseconds 200
    }

    if ((Get-RunningHubProcesses).Count -gt 0) {
        Write-Error "Failed to stop all Home.Hub processes."
    }

    if (Test-HubMutex) {
        Write-Error "Home.Hub single-instance lock is still held after stopping processes."
    }
}

Stop-RunningHubInstances

Write-Host "Building core libraries..."
dotnet build src/DXLight.Core/DXLight.Core.csproj -c $Configuration
dotnet build src/LightControls.Core/LightControls.Core.csproj -c $Configuration
dotnet build src/CleanShot.Core/CleanShot.Core.csproj -c $Configuration
dotnet build src/CleanShot.WinUI/CleanShot.WinUI.csproj -c $Configuration -p:Platform=x64
dotnet build src/Home.Windows/Home.Windows.csproj -c $Configuration
dotnet build src/Home.Core/Home.Core.csproj -c $Configuration
dotnet build src/Home.UI/Home.UI.csproj -c $Configuration -p:Platform=x64

Write-Host "Building hub and standalone launchers..."
dotnet build src/Home.Hub/Home.Hub.csproj -c $Configuration -p:Platform=x64
dotnet build src/Home.Standalone.LightControls/Home.Standalone.LightControls.csproj -c $Configuration
dotnet build src/Home.Standalone.CleanShot/Home.Standalone.CleanShot.csproj -c $Configuration

Write-Host "Build complete."
