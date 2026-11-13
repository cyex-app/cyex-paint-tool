# Bundles the pages into self-contained files (CSS, scripts and favicon inlined):
#   index.html -> cyex-paints.html        (the tool)
#   tests.html -> cyex-paints-tests.html  (the self-test)
# Run from this folder:  powershell -ExecutionPolicy Bypass -File .\build.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$enc = New-Object System.Text.UTF8Encoding($false)

function Build-Page([string]$src, [string]$dst) {
  $html = [IO.File]::ReadAllText((Join-Path $root $src), $enc)
  $html = [regex]::Replace($html, '<link rel="stylesheet" href="([^"]+)">', {
    param($m)
    $css = [IO.File]::ReadAllText((Join-Path $root $m.Groups[1].Value), $enc)
    "<style>`n$css`n</style>"
  })
  # extra attributes on the tag (e.g. data-engine) are kept on the inlined script
  $html = [regex]::Replace($html, '<script src="([^"]+)"([^>]*)></script>', {
    param($m)
    $js = [IO.File]::ReadAllText((Join-Path $root $m.Groups[1].Value), $enc)
    if ($js -match '</script') { throw "$($m.Groups[1].Value) contains a closing script tag" }
    "<script data-src=""$($m.Groups[1].Value)""$($m.Groups[2].Value)>`n$js`n</script>"
  })
  $svg = [IO.File]::ReadAllText((Join-Path $root 'favicon.svg'), $enc)
  $b64 = [Convert]::ToBase64String($enc.GetBytes($svg))
  $html = $html.Replace('href="favicon.svg"', "href=""data:image/svg+xml;base64,$b64""")
  $out = Join-Path $root $dst
  [IO.File]::WriteAllText($out, $html, $enc)
  Write-Output ("Built {0} ({1:N0} KB)" -f $out, ((Get-Item $out).Length / 1KB))
}

Build-Page 'index.html' 'cyex-paints.html'
Build-Page 'tests.html' 'cyex-paints-tests.html'
