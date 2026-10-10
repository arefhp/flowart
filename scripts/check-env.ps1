# Same as: node scripts/check-env.mjs
Set-Location (Join-Path $PSScriptRoot '..')
node scripts/check-env.mjs @args
exit $LASTEXITCODE
