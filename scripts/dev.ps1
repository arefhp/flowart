# Same as: npm run dev
Set-Location (Join-Path $PSScriptRoot '..')
npm.cmd run dev -- @args
exit $LASTEXITCODE
