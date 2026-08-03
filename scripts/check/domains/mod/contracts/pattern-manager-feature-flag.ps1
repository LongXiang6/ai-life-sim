# Purpose: Validate patternManager use against the subsystem feature flag.
# Owner: quality:mod
# Responsibility: D29 pattern manager reference and USE_PATTERN_MANAGER assertions only.

# === D29: USE_PATTERN_MANAGER flag ===
Write-Host "  [D29] Checking USE_PATTERN_MANAGER flag..." -ForegroundColor DarkGray
$d29StartErrors = $E.Errors
$d29StartWarnings = $E.Warnings
foreach ($md in $modDirs) {
  $mn = $md.Name
  $subsDir = Join-Path $md.FullName "subsystems"
  if (-not (Test-Path $subsDir)) { continue }
  $hasPatternDir = Test-Path (Join-Path $md.FullName "patterns")
  $subFiles = @(Get-ChildItem -Path $subsDir -Filter "*-system.ts" -File -ErrorAction SilentlyContinue)
  foreach ($sf in $subFiles) {
    $sc = Get-FileContent $sf.FullName
    if (-not $sc) { continue }
    $sfRel = "src/mods/${mn}/subsystems/$($sf.Name)"
    if ($sc -match '\b(pattern|match|regex)\b' -and $sc -notmatch 'patternManager') {
      if ($hasPatternDir) {
        Warn "D29-PATTERN-FLAG" $sfRel "" "Subsystem uses pattern matching but doesn't reference patternManager"
      }
    }
    if ($sc -match '\bpatternManager\b' -and $sc -notmatch 'USE_PATTERN_MANAGER') {
      Warn "D29-PATTERN-FLAG" $sfRel "" "Subsystem uses patternManager but missing USE_PATTERN_MANAGER feature flag"
    }
  }
}
$d29Errors = $E.Errors - $d29StartErrors
$d29Warnings = $E.Warnings - $d29StartWarnings
Write-Host "  D29-FLAG        : $d29Errors errors, $d29Warnings warnings" -ForegroundColor $(if ($d29Errors -gt 0) { "Red" } elseif ($d29Warnings -gt 0) { "Yellow" } else { "Green" })
