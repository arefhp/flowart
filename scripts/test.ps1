# Same as: npm test
Set-Location (Join-Path $PSScriptRoot '..')
npm.cmd test -- @args
exit $LASTEXITCODE
