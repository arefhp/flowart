# Same as: npm run typecheck
Set-Location (Join-Path $PSScriptRoot '..')
npm.cmd run typecheck -- @args
exit $LASTEXITCODE
