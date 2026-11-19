$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
New-Item -ItemType Directory -Path '.trueforge' -Force | Out-Null
$env:SQLITE_PATH = Join-Path (Resolve-Path '.trueforge').Path 'db.sqlite'
$env:OUTBOUND_URL_ALLOWED_HOSTS = '["127.0.0.1"]'
npx.cmd --yes @truefoundry/trueforge@0.185.1
if ($LASTEXITCODE -ne 0) { throw 'TrueForge failed. See docs/MODEL-SETUP.md for Windows Application Control troubleshooting.' }
