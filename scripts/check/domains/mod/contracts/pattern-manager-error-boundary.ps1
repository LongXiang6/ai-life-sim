# Purpose: Validate that patternManager calls are protected by local error handling.
# Owner: quality:mod
# Responsibility: F4 patternManager try/catch assertions only.

# === F4: patternManager try-catch ===
Write-Host "  [F4] Checking patternManager try-catch..." -ForegroundColor DarkGray
$f4StartErrors = $E.Errors
$f4StartWarnings = $E.Warnings
$allFilesF4 = $AllSrcFiles
foreach ($f in $allFilesF4) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  if ($fc -match 'patternManager\.') {
    $rel = $f.FullName.Substring($SrcDir.Length + 1).Replace('\','/')
    if ($fc -notmatch 'try\s*\{' -and $fc -notmatch 'catch\s*\(') {
      Warn "F4-PATTERN-TRY-CATCH" $rel "" "patternManager usage lacks try-catch error handling"
    }
  }
}
$f4Errors = $E.Errors - $f4StartErrors
$f4Warnings = $E.Warnings - $f4StartWarnings
Write-Host "  F4-TRY-CATCH    : $f4Errors errors, $f4Warnings warnings" -ForegroundColor $(if ($f4Errors -gt 0) { "Red" } elseif ($f4Warnings -gt 0) { "Yellow" } else { "Green" })
