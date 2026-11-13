# Bundles index.html + css/ + js/ into one self-contained file: cyex-paints.html
# Run from this folder:  powershell -ExecutionPolicy Bypass -File .\build.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$enc = New-Object System.Text.UTF8Encoding($false)
$html = [IO.File]::ReadAllText((Join-Path $root 'index.html'), $enc)

$html = [regex]::Replace($html, '<link rel="stylesheet" href="([^"]+)">', {
  param($m)
  $css = [IO.File]::ReadAllText((Join-Path $root $m.Groups[1].Value), $enc)
  "<style>`n$css`n</style>"
})
$html = [regex]::Replace($html, '<script src="([^"]+)"></script>', {
  param($m)
  $js = [IO.File]::ReadAllText((Join-Path $root $m.Groups[1].Value), $enc)
  if ($js -match '</script') { throw "$($m.Groups[1].Value) contains a closing script tag" }
  "<script>`n$js`n</script>"
})
$svg = [IO.File]::ReadAllText((Join-Path $root 'favicon.svg'), $enc)
$b64 = [Convert]::ToBase64String($enc.GetBytes($svg))
$html = $html.Replace('href="favicon.svg"', "href=""data:image/svg+xml;base64,$b64""")

$out = Join-Path $root 'cyex-paints.html'
[IO.File]::WriteAllText($out, $html, $enc)
Write-Output ("Built {0} ({1:N0} KB)" -f $out, ((Get-Item $out).Length / 1KB))
