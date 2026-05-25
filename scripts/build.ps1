param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",
    [switch]$IncludeLegacy
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

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

if ($IncludeLegacy) {
    Write-Host "Building legacy apps..."
    dotnet build legacy/DXLight.Tray/DXLight.Tray.csproj -c $Configuration
    dotnet build legacy/DXLight.Cli/DXLight.Cli.csproj -c $Configuration
    dotnet build legacy/LightControls.Desktop/LightControls.Desktop.csproj -c $Configuration
    dotnet build legacy/CleanShotW/CleanShotW.csproj -c $Configuration -p:Platform=x64
}

Write-Host "Build complete."
