param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$hubProject = "src/Home.Hub/Home.Hub.csproj"
$hubExe = Join-Path $root "src/Home.Hub/bin/x64/$Configuration/net10.0-windows10.0.19041.0/Home.Hub.exe"
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

Write-Host "Building Home.Hub..."
dotnet build $hubProject -c $Configuration -p:Platform=x64
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if (-not (Test-Path $hubExe)) {
    Write-Error "Home.Hub executable not found at $hubExe"
}

Write-Host "Launching Home.Hub..."
$process = Start-Process -FilePath $hubExe -PassThru

$deadline = [datetime]::UtcNow.AddSeconds(20)
while ([datetime]::UtcNow -lt $deadline) {
    if (Test-HubMutex) {
        Start-Sleep -Seconds 2
        $process.Refresh()
        if ($process.HasExited) {
            Write-Error "Home.Hub exited during startup (code $($process.ExitCode))."
        }

        Write-Host "Home launched."
        exit 0
    }

    if ($process.HasExited) {
        Write-Error "Home.Hub exited during startup (code $($process.ExitCode))."
    }

    Start-Sleep -Milliseconds 200
}

Write-Error "Timed out waiting for Home.Hub to start."
