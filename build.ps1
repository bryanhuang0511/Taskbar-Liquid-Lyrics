# build.ps1 - clean onedir build of TaskbarLiquidLyrics (ASCII only on purpose)
param([string]$Python = "")
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "== stop running instances =="
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

Write-Host "== sanity: imports must work in THIS environment =="
& $Python -c "import webview, clr_loader, pythonnet, soundcard, websockets, numpy, winrt.windows.media.control; print('imports ok')"
if ($LASTEXITCODE -ne 0) { throw "imports failed in this Python environment (build in the same env where 'python main.py' works)" }

& $Python -m pip install --upgrade pyinstaller pyinstaller-hooks-contrib pefile pillow
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

Write-Host "== CLR diagnostics (source environment) =="
& $Python .\diagnose_clr.py

if (-not (Test-Path ".\assets\app.ico")) {
    Write-Host "== assets\app.ico missing: regenerating with make_icon.py =="
    & $Python -m pip install --upgrade pillow numpy
    & $Python .\assets\make_icon.py
    if (-not (Test-Path ".\assets\app.ico")) { throw "assets\app.ico is missing and could not be generated" }
}

Remove-Item -Recurse -Force .\build, .\dist -ErrorAction SilentlyContinue
Write-Host "== PyInstaller (onedir) =="
& $Python -m PyInstaller --noconfirm --clean .\TaskbarLiquidLyrics.spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }

$dist = Join-Path $PSScriptRoot "dist\TaskbarLiquidLyrics"
Write-Host "== CLR diagnostics (bundled output) =="
& $Python .\diagnose_clr.py --dist $dist

# convenience: editable ui and config next to the exe (main.py prefers <exe dir>\ui over the bundled copy)
Copy-Item -Recurse -Force .\ui (Join-Path $dist "ui")
Copy-Item -Recurse -Force .\assets (Join-Path $dist "assets")
if (Test-Path .\config.json) { Copy-Item -Force .\config.json (Join-Path $dist "config.json") }

Write-Host "BUILD DONE: $dist\TaskbarLiquidLyrics.exe"
