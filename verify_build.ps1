# verify_build.ps1 - launch the built exe in the background, check tll.log, then stop it (ASCII only)
param([string]$Dist = ".\dist\TaskbarLiquidLyrics", [int]$WaitSeconds = 12)
$ErrorActionPreference = "Stop"
$Dist = (Resolve-Path $Dist).Path
$exe = Join-Path $Dist "TaskbarLiquidLyrics.exe"
if (-not (Test-Path $exe)) { throw "exe not found: $exe" }

Get-Process -Name TaskbarLiquidLyrics -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
$log = Join-Path $Dist "tll.log"
Remove-Item $log -ErrorAction SilentlyContinue

# Start-Process returns immediately; never run the GUI exe in a blocking foreground call
$p = Start-Process -FilePath $exe -WorkingDirectory $Dist -PassThru
Start-Sleep -Seconds $WaitSeconds

$alive = -not $p.HasExited
$text = ""
if (Test-Path $log) { $text = Get-Content $log -Raw -Encoding UTF8 }

$checks = [ordered]@{
    "process alive after wait" = $alive
    "clr preflight ok"         = ($text -match "ClrLoader.dll preloaded OK")
    "UI thread actions ok"     = ($text -match "UI thread actions executed successfully")
    "no fatal error in log"    = (-not ($text -match "Fatal error|UNCAUGHT FATAL"))
}
$failed = $false
foreach ($k in $checks.Keys) {
    if ($checks[$k]) { "{0,-28} PASS" -f $k } else { "{0,-28} FAIL" -f $k; $failed = $true }
}
if ($failed -and (Test-Path $log)) {
    Write-Host "---- tll.log (last 60 lines) ----"
    Get-Content $log -Tail 60 -Encoding UTF8
}
if ($alive) { Stop-Process -Id $p.Id -Force }
if ($failed) { exit 1 } else { Write-Host "ALL PASS"; exit 0 }
