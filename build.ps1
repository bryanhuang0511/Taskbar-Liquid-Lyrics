# build.ps1 - Clean onedir build & isolated Portable ZIP packager (ASCII only on purpose)
param(
    [switch]$PackageZip,
    [string]$Version = "1.0.0",
    [string]$Python = ""
)
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "== [1/6] Stop running instances =="
Get-Process -Name TaskbarLiquidLyrics -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

if (-not $Python) {
    $py312 = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
    if (Test-Path ".\.venv\Scripts\python.exe") { $Python = ".\.venv\Scripts\python.exe" }
    elseif (Test-Path $py312) { $Python = $py312 }
    else { $Python = "python" }
}
Write-Host "Using Python: $Python"
& $Python --version
& $Python -c "import struct; print('64-bit' if struct.calcsize('P')==8 else '32-bit')"

Write-Host "== [2/6] Verify Python environment dependencies =="
& $Python -c "import webview, clr_loader, pythonnet, soundcard, websockets, numpy, winrt.windows.media.control; print('imports ok')"
if ($LASTEXITCODE -ne 0) { throw "imports failed in this Python environment (build in the same env where 'python main.py' works)" }

& $Python -m pip install --upgrade pyinstaller pyinstaller-hooks-contrib pefile pillow | Out-Null
if ($LASTEXITCODE -ne 0) { throw "pip dependency check failed" }

if (-not (Test-Path ".\assets\app.ico")) {
    Write-Host "== assets\app.ico missing: regenerating with make_icon.py =="
    & $Python .\assets\make_icon.py
    if (-not (Test-Path ".\assets\app.ico")) { throw "assets\app.ico is missing and could not be generated" }
}

Write-Host "== [3/6] Preserve local runtime config (if present) and clean build/dist =="
$dist = Join-Path $PSScriptRoot "dist\TaskbarLiquidLyrics"
$localCfgBackup = $null
$existingDistCfg = Join-Path $dist "config.json"
if (Test-Path $existingDistCfg) {
    $localCfgBackup = Join-Path $env:TEMP "tll_local_config_backup.json"
    Copy-Item -Force $existingDistCfg $localCfgBackup
}
Remove-Item -Recurse -Force .\build, .\dist -ErrorAction SilentlyContinue

Write-Host "== [4/6] PyInstaller (onedir) build =="
& $Python -m PyInstaller --noconfirm --clean .\TaskbarLiquidLyrics.spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }

Write-Host "== [5/6] Verify bundled CLR runtime & stage dist folder =="
$clrDll = Join-Path $dist "_internal\clr_loader\ffi\dlls\amd64\ClrLoader.dll"
if (-not (Test-Path $clrDll)) {
    throw "Bundled ClrLoader.dll missing at: $clrDll"
}
Write-Host "CLR runtime check OK: $clrDll"

# Editable ui & assets next to exe (main.py prefers <exe dir>\ui)
Copy-Item -Recurse -Force .\ui (Join-Path $dist "ui")
Copy-Item -Recurse -Force .\assets (Join-Path $dist "assets")
Get-ChildItem -Path (Join-Path $dist "assets") -Recurse -Force -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
if ($localCfgBackup -and (Test-Path $localCfgBackup)) {
    Copy-Item -Force $localCfgBackup (Join-Path $dist "config.json")
    Remove-Item -Force $localCfgBackup -ErrorAction SilentlyContinue
    Write-Host "Restored local runtime config.json in dist"
} elseif (Test-Path .\config.example.json) {
    Copy-Item -Force .\config.example.json (Join-Path $dist "config.json")
}
Set-Content -Path (Join-Path $dist "Launch_TaskbarLiquidLyrics.bat") -Value '@start "" "%~dp0TaskbarLiquidLyrics.exe"' -Encoding ASCII

if ($PackageZip) {
    Write-Host "== [6/6] Create privacy-clean Portable ZIP =="
    $releasesDir = Join-Path $PSScriptRoot "releases"
    New-Item -ItemType Directory -Path $releasesDir -Force | Out-Null
    $zipName = "TaskbarLiquidLyrics_v${Version}_Portable.zip"
    $zipPath = Join-Path $releasesDir $zipName
    Remove-Item -Force $zipPath -ErrorAction SilentlyContinue

    $stageRoot = Join-Path $PSScriptRoot "build\_portable_stage"
    $stageApp = Join-Path $stageRoot "TaskbarLiquidLyrics"
    Remove-Item -Recurse -Force $stageRoot -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $stageApp -Force | Out-Null

    Copy-Item -Force (Join-Path $dist "TaskbarLiquidLyrics.exe") $stageApp
    Copy-Item -Recurse -Force (Join-Path $dist "_internal") (Join-Path $stageApp "_internal")
    Copy-Item -Recurse -Force .\ui (Join-Path $stageApp "ui")
    Copy-Item -Recurse -Force .\assets (Join-Path $stageApp "assets")
    Get-ChildItem -Path $stageApp -Recurse -Force -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $stageApp -Recurse -Force -File -Include "*.pyc","*.pyo" | Remove-Item -Force -ErrorAction SilentlyContinue
    foreach ($file in @("config.example.json", "LICENSE", "README.md", "CHANGELOG.md")) {
        if (Test-Path (Join-Path $PSScriptRoot $file)) {
            Copy-Item -Force (Join-Path $PSScriptRoot $file) $stageApp
        }
    }
    Set-Content -Path (Join-Path $stageApp "Launch_TaskbarLiquidLyrics.bat") -Value '@start "" "%~dp0TaskbarLiquidLyrics.exe"' -Encoding ASCII

    Compress-Archive -Path $stageApp -DestinationPath $zipPath -CompressionLevel Optimal -Force
    Remove-Item -Recurse -Force $stageRoot -ErrorAction SilentlyContinue

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        $forbidden = @("config.json", ".log", "__pycache__", ".lnk", "dev_tests", ".git/")
        foreach ($entry in $zip.Entries) {
            foreach ($bad in $forbidden) {
                if ($entry.FullName -like "*$bad*") {
                    throw "Privacy/purity check FAILED: forbidden entry '$($entry.FullName)' found in $zipName!"
                }
            }
        }
        Write-Host ("Portable ZIP verified clean: {0} ({1} entries, {2:N2} MB)" -f $zipName, $zip.Entries.Count, ((Get-Item $zipPath).Length / 1MB))
    } finally {
        $zip.Dispose()
    }
} else {
    Write-Host "== [6/6] Skipping Portable ZIP (pass -PackageZip to create release archive) =="
}

Write-Host "BUILD DONE: $dist\TaskbarLiquidLyrics.exe"
