# Purpose: Validate that theme switching uses the data-theme attribute.
# Owner: quality:ui
# Responsibility: C19 class-based theme switching assertions only.

# === C19: data-theme attribute ===
Write-Host "  [C19] Checking data-theme attribute..." -ForegroundColor DarkGray
$c19StartErrors = $E.Errors
$c19StartWarnings = $E.Warnings
$themeDir = Join-Path $SrcDir "core\theme"
if (Test-Path $themeDir) {
  $themeFiles = @(Get-ChildItem -Path $themeDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue)
  foreach ($tf in $themeFiles) {
    $tc = Get-FileContent $tf.FullName
    if (-not $tc) { continue }
    if (($tc -match 'setAttribute|classList\.add.*theme|className.*theme') -and $tc -notmatch 'data-theme') {
      $rel = "src/core/theme/$($tf.Name)"
      Warn "C19-THEME-ATTR" $rel "" "Theme switching should use data-theme attribute, not className-based themes"
    }
  }
}
$c19Errors = $E.Errors - $c19StartErrors
$c19Warnings = $E.Warnings - $c19StartWarnings
Write-Host "  C19-THEME-ATTR : $c19Errors errors, $c19Warnings warnings" -ForegroundColor $(if ($c19Errors -gt 0) { "Red" } elseif ($c19Warnings -gt 0) { "Yellow" } else { "Green" })
