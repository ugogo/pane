# Generates Home app icon assets (2x2 squircle mark with lime accent).
$ErrorActionPreference = "Stop"
$assetsDir = Join-Path $PSScriptRoot "..\src\Home.Hub\Assets"
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

Add-Type -AssemblyName System.Drawing

function Add-RoundedRect($path, $x, $y, $w, $h, $radius) {
    $d = $radius * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
}

function New-HomeMarkBitmap {
    param([int]$Size)
    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $tile = [System.Drawing.Color]::FromArgb(255, 18, 18, 24)
    $inactive = [System.Drawing.Color]::FromArgb(255, 61, 74, 92)
    $accent = [System.Drawing.Color]::FromArgb(255, 184, 245, 58)

    $pad = [Math]::Max(2, [int]($Size * 0.1))
    $inner = $Size - ($pad * 2)
    $tilePath = New-Object System.Drawing.Drawing2D.GraphicsPath
    Add-RoundedRect $tilePath $pad $pad $inner $inner ([int]($inner * 0.22))
    $g.FillPath((New-Object System.Drawing.SolidBrush $tile), $tilePath)

    $gap = [Math]::Max(1, [int]($Size * 0.045))
    $cell = [int](($inner - $gap) / 2)
    $ox = $pad
    $oy = $pad
    $r = [Math]::Max(2, [int]($cell * 0.35))

    function Draw-Cell($col, $row, $color) {
        $left = $ox + $col * ($cell + $gap)
        $top = $oy + $row * ($cell + $gap)
        $p = New-Object System.Drawing.Drawing2D.GraphicsPath
        Add-RoundedRect $p $left $top $cell $cell $r
        $g.FillPath((New-Object System.Drawing.SolidBrush $color), $p)
    }

    Draw-Cell 0 0 $inactive
    Draw-Cell 1 0 $inactive
    Draw-Cell 0 1 $accent
    Draw-Cell 1 1 $inactive

    $g.Dispose()
    return $bmp
}

function Save-Png($bmp, $path) {
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Save-MultiIco([int[]]$sizes, [string]$path) {
    $icons = foreach ($s in $sizes) { New-HomeMarkBitmap $s }
    $icon = [System.Drawing.Icon]::FromHandle($icons[-1].GetHicon())
    $fs = [System.IO.File]::Create($path)
    try {
        $icon.Save($fs)
    }
    finally {
        $fs.Close()
        $icon.Dispose()
        foreach ($i in $icons) { $i.Dispose() }
    }
}

$app256 = New-HomeMarkBitmap 256
Save-Png $app256 (Join-Path $assetsDir "app-icon.png")

$tray32 = New-HomeMarkBitmap 32
Save-MultiIco @(32) (Join-Path $assetsDir "tray-icon.ico")
$app256.Save((Join-Path $assetsDir "app-icon.ico"), [System.Drawing.Imaging.ImageFormat]::Icon)
$tray32.Dispose()

foreach ($pair in @(
        @{ Name = "Square44x44Logo.scale-200.png"; Size = 88 },
        @{ Name = "Square150x150Logo.scale-200.png"; Size = 300 },
        @{ Name = "SplashScreen.scale-200.png"; Size = 620 }
    )) {
    $bmp = New-HomeMarkBitmap $pair.Size
    Save-Png $bmp (Join-Path $assetsDir $pair.Name)
    $bmp.Dispose()
}

$wide = New-Object System.Drawing.Bitmap 620, 300
$wg = [System.Drawing.Graphics]::FromImage($wide)
$wg.Clear([System.Drawing.Color]::FromArgb(255, 12, 12, 18))
$mark = New-HomeMarkBitmap 200
$wg.DrawImage($mark, 30, 50, 200, 200)
$mark.Dispose()
$wg.Dispose()
Save-Png $wide (Join-Path $assetsDir "Wide310x150Logo.scale-200.png")
$wide.Dispose()

$app256.Dispose()
Write-Host "Icons written to $assetsDir"
