# Same as: node scripts/setup.mjs
Set-Location (Join-Path $PSScriptRoot '..')
node scripts/setup.mjs @args
exit $LASTEXITCODE
