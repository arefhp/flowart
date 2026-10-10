# Same as: npm run seed
Set-Location (Join-Path $PSScriptRoot '..')
npm.cmd run seed -- @args
exit $LASTEXITCODE
