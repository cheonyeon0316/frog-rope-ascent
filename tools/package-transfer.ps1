param(
    [string]$Destination,
    [string]$NodePath = (Get-Command node -ErrorAction Stop).Source,
    [string]$PnpmRoot
)
$ErrorActionPreference = 'Stop'
$taskProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskWorkspaceRoot = [IO.Path]::GetFullPath((Join-Path $taskProjectRoot '..\..'))
if (-not $Destination) { $Destination = Join-Path $taskWorkspaceRoot ('transfer\frog-ascent-transfer-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$taskTarget = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $taskTarget) { throw 'Choose a fresh destination; an existing package will not be overwritten.' }
if (-not $PnpmRoot) {
    foreach ($taskCandidate in @((Join-Path (Split-Path $NodePath) '..\node_modules\pnpm'), (Join-Path (Split-Path $NodePath) 'pnpm'))) {
        if (Test-Path -LiteralPath (Join-Path $taskCandidate 'bin\pnpm.mjs')) { $PnpmRoot = [IO.Path]::GetFullPath($taskCandidate); break }
    }
}
if (-not $PnpmRoot) { throw 'Pass -PnpmRoot pointing to the complete pnpm package.' }
$taskPnpm = Join-Path $PnpmRoot 'bin\pnpm.mjs'
$env:pnpm_config_pm_on_fail = 'ignore'
Push-Location -LiteralPath $taskProjectRoot
try {
    & $NodePath $taskPnpm test
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
    & $NodePath $taskPnpm build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
} finally { Pop-Location }
New-Item -ItemType Directory -Path $taskTarget -Force | Out-Null
$taskSource = Join-Path $taskTarget 'workspace\Last\browser\frog-rope-ascent'
New-Item -ItemType Directory -Path $taskSource -Force | Out-Null
foreach ($taskItem in Get-ChildItem -LiteralPath $taskProjectRoot -Force) {
    if ($taskItem.Name -eq 'playtest') {
        $taskReports = Join-Path $taskSource 'playtest'
        New-Item -ItemType Directory -Path $taskReports -Force | Out-Null
        foreach ($taskReport in Get-ChildItem -LiteralPath $taskItem.FullName -File) {
            if ($taskReport.Name -ne 'transfer-save.json') { Copy-Item -LiteralPath $taskReport.FullName -Destination $taskReports -Force }
        }
    } elseif ($taskItem.Name -notin @('node_modules', 'dist', '.git') -and $taskItem.Name -notlike '.env*') {
        Copy-Item -LiteralPath $taskItem.FullName -Destination $taskSource -Recurse -Force
    }
}
$taskLast = Join-Path $taskTarget 'workspace\Last'
foreach ($taskName in @('planning', 'refs', 'README.md', 'get-to-work-research.md', 'HANDOFF.md', 'AGENTS.md')) {
    Copy-Item -LiteralPath (Join-Path $taskWorkspaceRoot $taskName) -Destination $taskLast -Recurse -Force
}
# Preserve this game's original proposal; do not copy unrelated Unity projects or caches.
$taskLegacy = Join-Path (Split-Path $taskWorkspaceRoot) '1006'
if (Test-Path -LiteralPath (Join-Path $taskLegacy 'openspec\changes\frog-rope-ascent-prototype')) {
    $taskOldChanges = Join-Path $taskTarget 'workspace\1006\openspec\changes'
    New-Item -ItemType Directory -Path $taskOldChanges -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $taskLegacy 'openspec\changes\frog-rope-ascent-prototype') -Destination $taskOldChanges -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $taskLegacy 'openspec\config.yaml') -Destination (Split-Path $taskOldChanges) -Force
    $taskSkills = Join-Path $taskLegacy '.agents\skills'
    if (Test-Path -LiteralPath $taskSkills) {
        New-Item -ItemType Directory -Path (Join-Path $taskTarget 'workspace\1006\.agents') -Force | Out-Null
        Copy-Item -LiteralPath $taskSkills -Destination (Join-Path $taskTarget 'workspace\1006\.agents') -Recurse -Force
    }
}
Copy-Item -LiteralPath (Join-Path $taskProjectRoot 'dist') -Destination (Join-Path $taskTarget 'game') -Recurse -Force
foreach ($taskDir in @('runtime', 'tools', 'licenses')) { New-Item -ItemType Directory -Path (Join-Path $taskTarget $taskDir) -Force | Out-Null }
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $taskTarget 'runtime\node.exe') -Force
Copy-Item -LiteralPath $PnpmRoot -Destination (Join-Path $taskTarget 'runtime\pnpm') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'serve.mjs') -Destination (Join-Path $taskTarget 'tools\serve.mjs') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'transfer-guide.md') -Destination (Join-Path $taskTarget 'READ-ME.md') -Force
Copy-Item -LiteralPath (Join-Path $taskWorkspaceRoot 'HANDOFF.md') -Destination $taskTarget -Force
Copy-Item -LiteralPath (Join-Path $taskProjectRoot 'node_modules\three\LICENSE') -Destination (Join-Path $taskTarget 'licenses\Three-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $taskProjectRoot 'node_modules\@dimforge\rapier3d-compat\LICENSE') -Destination (Join-Path $taskTarget 'licenses\Rapier-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $PnpmRoot 'LICENSE') -Destination (Join-Path $taskTarget 'licenses\pnpm-LICENSE.txt') -Force
$taskNodeVersion = (& $NodePath --version).Trim()
$taskLicenseUrl = "https://raw.githubusercontent.com/nodejs/node/$taskNodeVersion/LICENSE"
Invoke-WebRequest -Uri $taskLicenseUrl -OutFile (Join-Path $taskTarget 'licenses\Node-LICENSE.txt')
Set-Content -LiteralPath (Join-Path $taskTarget 'licenses\SOURCES.txt') -Encoding utf8 -Value @"
Node ${taskNodeVersion}: $taskLicenseUrl
pnpm: included runtime/pnpm/LICENSE and bundled dependency notices
Three: workspace/Last/browser/frog-rope-ascent/node_modules/three/LICENSE at package creation
Rapier: workspace/Last/browser/frog-rope-ascent/node_modules/@dimforge/rapier3d-compat/LICENSE at package creation
Reference media: supplied research material, preserved in workspace/Last/refs, not in game runtime assets.
"@
Set-Content -LiteralPath (Join-Path $taskTarget 'START-GAME.cmd') -Encoding ascii -Value @'
@echo off
setlocal
"%~dp0runtime\node.exe" "%~dp0tools\serve.mjs" --open
if errorlevel 1 pause
'@
Set-Content -LiteralPath (Join-Path $taskTarget 'DEVELOP.cmd') -Encoding ascii -Value @'
@echo off
setlocal
set "PATH=%~dp0runtime;%PATH%"
set "pnpm_config_pm_on_fail=ignore"
cd /d "%~dp0workspace\Last\browser\frog-rope-ascent"
"%~dp0runtime\node.exe" "%~dp0runtime\pnpm\bin\pnpm.mjs" install --frozen-lockfile
if errorlevel 1 goto failed
"%~dp0runtime\node.exe" "%~dp0runtime\pnpm\bin\pnpm.mjs" dev --open
if errorlevel 1 goto failed
exit /b 0
:failed
pause
exit /b 1
'@
Set-Content -LiteralPath (Join-Path $taskTarget 'BUILD-GAME.cmd') -Encoding ascii -Value @'
@echo off
setlocal
set "PATH=%~dp0runtime;%PATH%"
set "pnpm_config_pm_on_fail=ignore"
cd /d "%~dp0workspace\Last\browser\frog-rope-ascent"
"%~dp0runtime\node.exe" "%~dp0runtime\pnpm\bin\pnpm.mjs" install --frozen-lockfile
if errorlevel 1 goto failed
"%~dp0runtime\node.exe" "%~dp0runtime\pnpm\bin\pnpm.mjs" test
if errorlevel 1 goto failed
"%~dp0runtime\node.exe" "%~dp0runtime\pnpm\bin\pnpm.mjs" build
if errorlevel 1 goto failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\update-build.ps1"
if errorlevel 1 goto failed
echo Build updated. Run START-GAME.cmd.
pause
exit /b 0
:failed
pause
exit /b 1
'@
Set-Content -LiteralPath (Join-Path $taskTarget 'tools\update-build.ps1') -Encoding utf8 -Value @'
$ErrorActionPreference = 'Stop'
$taskPackage = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskBuild = Join-Path $taskPackage 'workspace\Last\browser\frog-rope-ascent\dist'
$taskGame = Join-Path $taskPackage 'game'
if (-not (Test-Path -LiteralPath (Join-Path $taskBuild 'index.html'))) { throw 'Build output missing.' }
foreach ($taskItem in Get-ChildItem -LiteralPath $taskBuild -Force) {
    Copy-Item -LiteralPath $taskItem.FullName -Destination $taskGame -Recurse -Force
}
'@
$taskManifest = foreach ($taskFile in Get-ChildItem -LiteralPath $taskTarget -Recurse -Force -File) {
    $taskRelative = [IO.Path]::GetRelativePath($taskTarget, $taskFile.FullName).Replace('\', '/')
    (Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $taskRelative
}
Set-Content -LiteralPath (Join-Path $taskTarget 'MANIFEST.sha256') -Value $taskManifest -Encoding utf8
$taskZip = $taskTarget + '.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($taskTarget, $taskZip, [IO.Compression.CompressionLevel]::Optimal, $true)
Get-Item -LiteralPath $taskZip | Select-Object FullName, Length
Get-FileHash -LiteralPath $taskZip -Algorithm SHA256
