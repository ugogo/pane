param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$hubProject = "src/Home.Hub/Home.Hub.csproj"
$hubExe = Join-Path $root "src/Home.Hub/bin/x64/$Configuration/net10.0-windows10.0.19041.0/Home.Hub.exe"
$mutexName = "Local\Home_Hub_SingleInstance"

function Test-HubMutex {
    try {
        $mutex = [System.Threading.Mutex]::OpenExisting($mutexName)
        $mutex.Dispose()
        return $true
    }
    catch [System.Threading.WaitHandleCannotBeOpenedException] {
        return $false
    }
}

Write-Host "Building Home.Hub..."
dotnet build $hubProject -c $Configuration -p:Platform=x64 | Out-Null
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if (-not (Test-Path $hubExe)) {
    Write-Error "Home.Hub executable not found at $hubExe"
}

if (Test-HubMutex) {
    Write-Host "Home is already running."
    exit 0
}

Write-Host "Launching Home.Hub..."
$process = Start-Process -FilePath $hubExe -PassThru

$deadline = [datetime]::UtcNow.AddSeconds(20)
while ([datetime]::UtcNow -lt $deadline) {
    if (Test-HubMutex) {
        Write-Host "Home launched."
        exit 0
    }

    if ($process.HasExited -and $process.ExitCode -ne 0) {
        Write-Error "Home.Hub exited during startup (code $($process.ExitCode))."
    }

    Start-Sleep -Milliseconds 200
}

Write-Error "Timed out waiting for Home.Hub to start."
