# Speichert die Poly-Haven-Texturen mit JPEG-Qualität 85 neu (gleiche Auflösung).
# Die Originale sind fast verlustfrei gespeichert und dadurch drei- bis viermal so groß;
# im Spiel sieht man keinen Unterschied, aber das Laden geht deutlich schneller.
# Dateien mit weniger als 0,5 Byte pro Pixel gelten als schon verkleinert und bleiben unverändert,
# damit ein zweiter Lauf die Bilder nicht weiter verschlechtert.
Add-Type -AssemblyName System.Drawing

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\public\assets\textures')).Path
$quality = 85
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$quality)

Get-ChildItem -Path $root -Recurse -Filter *.jpg | ForEach-Object {
  $file = $_.FullName
  $img = [System.Drawing.Image]::FromFile($file)
  $pixels = $img.Width * $img.Height
  $before = $_.Length
  if ($before / $pixels -lt 0.5) {
    $img.Dispose()
    return
  }
  $tmp = "$file.tmp"
  $img.Save($tmp, $codec, $params)
  $img.Dispose()
  Move-Item -Force $tmp $file
  $after = (Get-Item $file).Length
  '{0}: {1:N0} KB -> {2:N0} KB' -f $_.FullName.Substring($root.Length + 1), ($before / 1KB), ($after / 1KB)
}
