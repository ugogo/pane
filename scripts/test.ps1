param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

& "$PSScriptRoot/build.ps1" -Configuration $Configuration -IncludeLegacy

dotnet test tests/DXLight.Core.Tests/DXLight.Core.Tests.csproj -c $Configuration
dotnet test tests/LightControls.Tests/LightControls.Tests.csproj -c $Configuration --filter "Category!=Integration"
dotnet test tests/CleanShotW.Tests/CleanShotW.Tests.csproj -c $Configuration -p:Platform=x64
