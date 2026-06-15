$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$distPath = Join-Path $root "dist"
$zipPath = Join-Path $root "creator-demo-widget.zip"

if (-not (Test-Path $distPath)) {
  throw "Build output not found at '$distPath'. Run the build first."
}

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $distPath "*") -DestinationPath $zipPath -Force

Write-Host "Widget package created:" -NoNewline
Write-Host " $zipPath" -ForegroundColor Green
