# Purpose: Validate the declared MOD pattern-management layer.
# Owner: quality:mod
# Responsibility: D18 required files, types, base class, and feature-flag assertions only.

foreach ($md in $modDirs) {
  $mn = $md.Name
  $mp = Join-Path $md.FullName "manifest.ts"
  if (-not (Test-Path $mp)) { continue }
  $mc = Get-FileContent $mp
  # Check if manifest declares patterns-related provides or subsystems
  if ($mc -notmatch "patterns" -and $mc -notmatch "Pattern") { continue }

  $patternsDir = Join-Path $md.FullName "patterns"
  $patternRequiredFiles = @("pattern-types.ts", "base-pattern.ts", "pattern-registry.ts", "pattern-factory.ts")
  foreach ($prf in $patternRequiredFiles) {
    $prfPath = Join-Path $patternsDir $prf
    if (-not (Test-Path $prfPath)) {
      Warn "D18-PATTERN-FILE" $mn "" "patterns/ missing required file: $prf"
    }
  }

  # Check pattern-types.ts for required type definitions
  $ptPath = Join-Path $patternsDir "pattern-types.ts"
  if (Test-Path $ptPath) {
    $ptContent = Get-FileContent $ptPath
    if ($ptContent -notmatch 'PatternCategory') {
      Warn "D18-PATTERN-TYPE" $mn "" "pattern-types.ts missing PatternCategory type"
    }
    if ($ptContent -notmatch 'PatternDefinition') {
      Warn "D18-PATTERN-TYPE" $mn "" "pattern-types.ts missing PatternDefinition type"
    }
  }

  # Check base-pattern.ts for BasePattern abstract class
  $bpPath = Join-Path $patternsDir "base-pattern.ts"
  if (Test-Path $bpPath) {
    $bpContent = Get-FileContent $bpPath
    if ($bpContent -notmatch 'abstract class BasePattern') {
      Fail "D18-PATTERN-BASE" $mn "" "base-pattern.ts missing abstract class BasePattern"
    }
  }

  # Check pattern-factory.ts for USE_PATTERN_MANAGER flag
  $pfPath = Join-Path $patternsDir "pattern-factory.ts"
  if (Test-Path $pfPath) {
    $pfContent = Get-FileContent $pfPath
    if ($pfContent -notmatch 'USE_PATTERN_MANAGER') {
      Warn "D18-PATTERN-FLAG" $mn "" "pattern-factory.ts missing USE_PATTERN_MANAGER feature flag"
    }
  }
}
