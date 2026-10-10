# Same as: npm run build
Set-Location (Join-Path $PSScriptRoot '..')
npm.cmd run build -- @args
exit $LASTEXITCODE
