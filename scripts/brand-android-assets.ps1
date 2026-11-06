Add-Type -AssemblyName System.Drawing
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$resources = Join-Path $projectRoot 'android/app/src/main/res'
$source = [System.Drawing.Image]::FromFile((Join-Path $projectRoot 'icon-512.png'))
try {
  $densities = [ordered]@{ mdpi = 48; hdpi = 72; xhdpi = 96; xxhdpi = 144; xxxhdpi = 192 }
  foreach ($density in $densities.Keys) {
    $size = $densities[$density]
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.DrawImage($source, 0, 0, $size, $size)
      $target = Join-Path $resources "mipmap-$density"
      $bitmap.Save((Join-Path $target 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png)
      $bitmap.Save((Join-Path $target 'ic_launcher_round.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
} finally { $source.Dispose() }

$fonts = [System.Drawing.Text.PrivateFontCollection]::new()
try {
  $fonts.AddFontFile((Join-Path $projectRoot 'fonts/Barlow-Black.ttf'))
  $family = $fonts.Families[0]
  $background = [System.Drawing.ColorTranslator]::FromHtml('#06191D')
  $primary = [System.Drawing.ColorTranslator]::FromHtml('#56DCC4')
  $secondary = [System.Drawing.ColorTranslator]::FromHtml('#6FA9FF')
  $white = [System.Drawing.ColorTranslator]::FromHtml('#EDFFFB')
  foreach ($file in @(Get-ChildItem -Path $resources -Recurse -Filter 'splash.png')) {
    $original = [System.Drawing.Image]::FromFile($file.FullName)
    $width = $original.Width
    $height = $original.Height
    $original.Dispose()
    $bitmap = [System.Drawing.Bitmap]::new($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $format = [System.Drawing.StringFormat]::new()
    $titleFont = [System.Drawing.Font]::new($family, [float]([Math]::Min($width, $height) * 0.13))
    $editionFont = [System.Drawing.Font]::new($family, [float]([Math]::Min($width, $height) * 0.065))
    $titleBrush = [System.Drawing.SolidBrush]::new($white)
    $editionBrush = [System.Drawing.SolidBrush]::new($secondary)
    $linePen = [System.Drawing.Pen]::new($primary, [float]([Math]::Max(2, $width * 0.007)))
    try {
      $graphics.Clear($background)
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
      $format.Alignment = [System.Drawing.StringAlignment]::Center
      $format.LineAlignment = [System.Drawing.StringAlignment]::Center
      $unit = [float]([Math]::Min($width, $height))
      $graphics.DrawString('SciRun', $titleFont, $titleBrush, [System.Drawing.RectangleF]::new(0, [float]($height / 2 - $unit * 0.17), [float]$width, [float]($unit * 0.15)), $format)
      $graphics.DrawLine($linePen, [float]($width * 0.31), [float]($height / 2 + $unit * 0.015), [float]($width * 0.69), [float]($height / 2 + $unit * 0.015))
      $graphics.DrawString('5K', $editionFont, $editionBrush, [System.Drawing.RectangleF]::new(0, [float]($height / 2 + $unit * 0.025), [float]$width, [float]($unit * 0.09)), $format)
      $bitmap.Save($file.FullName, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $linePen.Dispose(); $editionBrush.Dispose(); $titleBrush.Dispose()
      $editionFont.Dispose(); $titleFont.Dispose(); $format.Dispose()
      $graphics.Dispose(); $bitmap.Dispose()
    }
  }
} finally { $fonts.Dispose() }
Write-Output 'SciRun Android launcher and splash assets updated.'
