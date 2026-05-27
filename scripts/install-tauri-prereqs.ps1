param(
    [switch]$SkipVisualStudioBuildTools
)

$ErrorActionPreference = "Stop"
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if ((Test-Path $cargoBin) -and -not ($env:Path -split ";" | Where-Object { $_ -ieq $cargoBin })) {
    $env:Path = "$cargoBin;$env:Path"
}

function Assert-Winget {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "winget is required to install Tauri prerequisites automatically."
    }
}

function Install-Rustup {
    if (Get-Command cargo -ErrorAction SilentlyContinue) {
        Write-Host "Cargo is already available."
        return
    }

    Write-Host "Installing Rust via rustup..."
    winget install --id Rustlang.Rustup --exact --source winget --accept-package-agreements --accept-source-agreements

    $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
    if ((Test-Path $cargoBin) -and -not ($env:Path -split ";" | Where-Object { $_ -ieq $cargoBin })) {
        $env:Path = "$cargoBin;$env:Path"
    }

    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        throw "Rust installed, but cargo is not available in this shell. Open a new PowerShell session and try again."
    }
}

function Install-VisualStudioBuildTools {
    if ($SkipVisualStudioBuildTools) {
        Write-Host "Skipping Visual Studio Build Tools install."
        return
    }

    if (-not (Test-IsAdministrator)) {
        throw "Visual Studio Build Tools changes require an elevated PowerShell session. Re-run this command as Administrator."
    }

    $buildToolsPath = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools"
    $setupPath = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\setup.exe"

    if ((Test-Path $buildToolsPath) -and (Test-Path $setupPath)) {
        Write-Host "Adding C++ desktop workload to existing Visual Studio Build Tools..."
        & $setupPath modify `
            --installPath $buildToolsPath `
            --wait `
            --quiet `
            --add Microsoft.VisualStudio.Workload.VCTools `
            --includeRecommended
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) {
            throw "Visual Studio Build Tools workload install failed with exit code $LASTEXITCODE."
        }
        return
    }

    Write-Host "Installing Visual Studio Build Tools with C++ desktop workload..."
    winget install `
        --id Microsoft.VisualStudio.2022.BuildTools `
        --exact `
        --source winget `
        --accept-package-agreements `
        --accept-source-agreements `
        --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) {
        throw "Visual Studio Build Tools install failed with exit code $LASTEXITCODE."
    }
}

function Test-IsAdministrator {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Assert-Winget
Install-Rustup
Install-VisualStudioBuildTools

Write-Host "Tauri prerequisite installation finished. If cargo or MSVC still are not detected, open a new PowerShell session."
