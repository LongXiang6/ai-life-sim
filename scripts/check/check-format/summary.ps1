# Purpose: Publish checker summaries, optional append-only text output, structured reports, and exit status.
# Owner: quality:infrastructure
# Responsibility: Final result projection and process exit only.

# -------------------------------------------------------
# 3. Summary    
# -------------------------------------------------------
if ($Global:QuietConsole) {
  if ($E.Errors -gt 0) {
    Write-Host "[check:mod] FAIL — $($E.Errors) error(s), $($E.Warnings) warn(s) (detail in reports/)" -ForegroundColor Red
  } else {
    Write-Host "[check:mod] PASS — $($E.Pass) checks, $($E.Warnings) warn(s) suppressed" -ForegroundColor Green
  }
} else {
Write-Host ""
Write-Host "========================================================"
Write-Host "  Check Summary"
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "       $($E.Total)"
Write-Host "  [FAIL]      $($E.Errors)" -ForegroundColor $(if ($E.Errors -gt 0) { "Red" } else { "Green" })
Write-Host "  [WARN]      $($E.Warnings)" -ForegroundColor $(if ($E.Warnings -gt 0) { "Yellow" } else { "Green" })
Write-Host "  [OK]        $($E.Pass)" -ForegroundColor Green
Write-Host ""
Write-Host "  前瞻事件 WARN（D8-ORPHAN-EMIT / D14-EMIT-UNUSED 等）通常可忽略；MOD 上下文见 .agents/skills/ai-life-sim-mod-development/" -ForegroundColor DarkGray
Write-Host ""
}

# -------------------------------------------------------
# 4.              
# -------------------------------------------------------
if (-not $Global:QuietConsole -and ($E.Errors -gt 0 -or $E.Warnings -gt 0)) {
  Write-Host "========================================================"
  Write-Host "  Issues by File"
  Write-Host "========================================================" -ForegroundColor Magenta

  $grouped = $Results | Group-Object File
  foreach ($g in $grouped) {
    $errCount = ($g.Group | Where-Object { $_.Level -eq 'ERROR' }).Count
    $warnCount = ($g.Group | Where-Object { $_.Level -eq 'WARN' }).Count
    $icon = if ($errCount -gt 0) { "[FAIL]" } else { "[WARN]" }
    $color = if ($errCount -gt 0) { "Red" } else { "Yellow" }
    Write-Host ""
    Write-Host "  $icon $($g.Name)  (   $errCount /    $warnCount)" -ForegroundColor $color
    foreach ($item in $g.Group) {
      $prefix = if ($item.Level -eq 'ERROR') { "    [FAIL] [$($item.Rule)]" } else { "    [WARN] [$($item.Rule)]" }
      Write-Host "$prefix $($item.Message)" -ForegroundColor $color
    }
  }
  Write-Host ""
}

# -------------------------------------------------------
# 5.    exit code
# -------------------------------------------------------
if (-not $Global:QuietConsole) {
if ($E.Errors -gt 0) {
  Write-Host "         - $($E.Errors)        " -ForegroundColor Red
} else {
  Write-Host "       " -ForegroundColor Green
}
}

# -------------------------------------------------------
# 6.         (Add-Content   )
# -------------------------------------------------------
if ($ReportFile) {
  $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $sep = "=" * 56
  
  #      timestamp      
  $header = @"
$sep
   $now
   $($modDirs.Count) MOD + core/foundation/app
   [FAIL] $($E.Errors)   [WARN] $($E.Warnings)   [OK] $($E.Pass)
$sep
"@
  Add-Content -Path $ReportFile -Value $header -Encoding UTF8

  $grouped = $Results | Group-Object File
  foreach ($g in $grouped) {
    Add-Content -Path $ReportFile -Value "" -Encoding UTF8
    $errCount = ($g.Group | Where-Object { $_.Level -eq 'ERROR' }).Count
    $warnCount = ($g.Group | Where-Object { $_.Level -eq 'WARN' }).Count
    $icon = if ($errCount -gt 0) { "[FAIL]" } else { "[WARN]" }
    Add-Content -Path $ReportFile -Value "  $icon $($g.Name)  (FAIL=$errCount / WARN=$warnCount)" -Encoding UTF8
    foreach ($item in $g.Group) {
      Add-Content -Path $ReportFile -Value "    [$($item.Level)] [$($item.Rule)] $($item.Message)" -Encoding UTF8
    }
  }
  
  Add-Content -Path $ReportFile -Value "" -Encoding UTF8
  Add-Content -Path $ReportFile -Value "       [FAIL] $($E.Errors)   [WARN] $($E.Warnings)   [OK] $($E.Pass)" -Encoding UTF8
  Add-Content -Path $ReportFile -Value $sep -Encoding UTF8
  Add-Content -Path $ReportFile -Value "" -Encoding UTF8
}

# Auto-save structured reports
Save-Reports $modDirs.Count

if ($E.Errors -gt 0) {
  exit 1
} else {
  exit 0
}
