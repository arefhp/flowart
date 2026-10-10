# Same as: npm run lint
Set-Location (Join-Path $PSScriptRoot '..')
npm.cmd run lint -- @args
exit $LASTEXITCODE
