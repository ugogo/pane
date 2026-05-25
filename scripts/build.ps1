param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Building core libraries..."
dotnet build src/DXLight.Core/DXLight.Core.csproj -c $Configuration
dotnet build src/LightControls.Core/LightControls.Core.csproj -c $Configuration
dotnet build src/CleanShot.Core/CleanShot.Core.csproj -c $Configuration
dotnet build src/Home.Windows/Home.Windows.csproj -c $Configuration

Write-Host "Building legacy apps..."
dotnet build legacy/DXLight.Tray/DXLight.Tray.csproj -c $Configuration
dotnet build legacy/DXLight.Cli/DXLight.Cli.csproj -c $Configuration
dotnet build legacy/LightControls.Desktop/LightControls.Desktop.csproj -c $Configuration
dotnet build legacy/CleanShotW/CleanShotW.csproj -c $Configuration -p:Platform=x64

Write-Host "Build complete."
