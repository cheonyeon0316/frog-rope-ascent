$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskPnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
$taskPnpmFallback = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
if ($taskPnpmCommand) {
    $taskPnpmPath = $taskPnpmCommand.Source
} elseif (Test-Path -LiteralPath $taskPnpmFallback) {
    $taskPnpmPath = $taskPnpmFallback
} else {
    throw 'pnpm을 설치한 뒤 다시 실행해 주세요.'
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
    & $taskPnpmPath install
    if ($LASTEXITCODE -ne 0) { throw '의존성을 설치하지 못했습니다.' }
}
Write-Host '혀끝까지: http://127.0.0.1:5173/ — 종료: Ctrl+C'
& $taskPnpmPath dev
