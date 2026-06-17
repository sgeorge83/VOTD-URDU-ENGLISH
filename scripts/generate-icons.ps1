$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$iconsDir = Join-Path $PSScriptRoot "..\icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

$avatarUrl = "https://avatars.githubusercontent.com/u/208852026?v=4"
$tempFile = Join-Path $env:TEMP "sgeorge83-avatar.png"

Invoke-WebRequest -Uri $avatarUrl -OutFile $tempFile -UseBasicParsing

function Save-SquareIcon {
  param(
    [System.Drawing.Image]$Source,
    [int]$Size,
    [string]$Path
  )

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::FromArgb(255, 15, 15, 15))

  $scale = [Math]::Max($Size / $Source.Width, $Size / $Source.Height)
  $drawWidth = [int]($Source.Width * $scale)
  $drawHeight = [int]($Source.Height * $scale)
  $x = [int](($Size - $drawWidth) / 2)
  $y = [int](($Size - $drawHeight) / 2)

  $g.DrawImage($Source, $x, $y, $drawWidth, $drawHeight)
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose()
  $bmp.Dispose()
}

$avatar = [System.Drawing.Image]::FromFile($tempFile)
Save-SquareIcon -Source $avatar -Size 192 -Path (Join-Path $iconsDir "icon-192.png")
Save-SquareIcon -Source $avatar -Size 512 -Path (Join-Path $iconsDir "icon-512.png")
$avatar.Dispose()
Remove-Item $tempFile -Force

Write-Output "Icons updated from sgeorge83 GitHub avatar."
