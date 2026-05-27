param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$TauriArgs
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"

if (Test-Path $cargoBin) {
    $env:Path = "$cargoBin;$env:Path"
}

Set-Location $root
npm --prefix src run tauri -- @TauriArgs
