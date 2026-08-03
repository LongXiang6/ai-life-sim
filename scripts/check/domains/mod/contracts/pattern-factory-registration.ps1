# Purpose: Validate that exported patterns are registered by the owning pattern factory.
# Owner: quality:mod
# Responsibility: D28 pattern array or class registration assertions only.

# === D28: PatternFactory registration ===
Write-Host "  [D28] Checking PatternFactory registration..." -ForegroundColor DarkGray
$d28StartErrors = $E.Errors
$d28StartWarnings = $E.Warnings
foreach ($md in $modDirs) {
  $mn = $md.Name
  $patternsDir = Join-Path $md.FullName "patterns"
  if (-not (Test-Path $patternsDir)) { continue }
  $factoryFile = Join-Path $patternsDir "pattern-factory.ts"
  if (-not (Test-Path $factoryFile)) { continue }
  $fc = Get-FileContent $factoryFile
  if (-not $fc) { continue }
  $pFiles = @(Get-ChildItem -Path $patternsDir -Filter "*-patterns.ts" -File -ErrorAction SilentlyContinue)
  foreach ($pf in $pFiles) {
    $pc = Get-FileContent $pf.FullName
    if (-not $pc) { continue }

    # Collect exported array names from this pattern file (e.g. CLOSURE_PATTERNS, IMPORTANCE_PATTERNS)
    $exportedArrays = @()
    $arrayMatches = [regex]::Matches($pc, 'export\s+const\s+([A-Z][A-Z0-9_]+)\s*=\s*\[')
    foreach ($am in $arrayMatches) {
      $exportedArrays += $am.Groups[1].Value
    }
    # Also match: export const XXX = [...]
    $arrayMatches2 = [regex]::Matches($pc, 'export\s+const\s+([A-Z][A-Z0-9_]+)\s*:\s*\w+\[\]\s*=\s*\[')
    foreach ($am in $arrayMatches2) {
      if ($am.Groups[1].Value -notin $exportedArrays) {
        $exportedArrays += $am.Groups[1].Value
      }
    }

    # Check if any exported array from this file is referenced in the factory
    $registeredViaArray = $false
    foreach ($arrName in $exportedArrays) {
      if ($fc -match [regex]::Escape($arrName)) {
        $registeredViaArray = $true
        break
      }
    }

    # If patterns are registered via an array in the factory, skip individual class checks
    if ($registeredViaArray) { continue }

    $classMatches = [regex]::Matches($pc, 'export\s+class\s+(\w+Pattern)\b')
    foreach ($cm in $classMatches) {
      $className = $cm.Groups[1].Value
      if ($fc -notmatch [regex]::Escape($className)) {
        Warn "D28-PATTERN-FACTORY" "src/mods/${mn}/patterns/$($pf.Name)" "" "Pattern class '$className' not registered in pattern-factory.ts"
      }
    }
  }
}
$d28Errors = $E.Errors - $d28StartErrors
$d28Warnings = $E.Warnings - $d28StartWarnings
Write-Host "  D28-FACTORY     : $d28Errors errors, $d28Warnings warnings" -ForegroundColor $(if ($d28Errors -gt 0) { "Red" } elseif ($d28Warnings -gt 0) { "Yellow" } else { "Green" })
