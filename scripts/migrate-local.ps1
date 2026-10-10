# Same as: npm run migrate:local
Set-Location (Join-Path $PSScriptRoot '..')
npm.cmd run migrate:local -- @args
exit $LASTEXITCODE
