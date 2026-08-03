# Purpose: Validate fault isolation, pattern ownership, declarative manifests, prompts, and internal type exports.
# Owner: quality:mod
# Responsibility: Architecture post-passes 4 through 8 only.

# Post-pass 4: Fault Isolation Check (F-class)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 4: F Fault Isolation Check ---" -ForegroundColor Cyan

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName

  $modTsFiles = @(Get-ChildItem -Path $modPath -Recurse -Include "*.ts" -File)
  foreach ($tsFile in $modTsFiles) {
    $tsContent = Get-FileContent $tsFile.FullName
    $relPath = "src/mods/${modName}/$($tsFile.Name)"

    # F1: Cross-MOD import with try-catch or dynamic import
    $crossModImports = [regex]::Matches($tsContent, "from\s+'@/mods/(mod-[a-z0-9-]+)(/index)?'")
    if ($crossModImports.Count -gt 0 -and $tsFile.Name -ne 'manifest.ts') {
      foreach ($cm in $crossModImports) {
        $impMod = $cm.Groups[1].Value
        if ($impMod -eq $modName) { continue }
        if ($tsContent -notmatch 'try\s*\{' -and $tsContent -notmatch 'import\s*\(') {
          Warn "F1-NO-TRY-CATCH" $relPath "" "File imports '$impMod' but no try-catch or dynamic import fallback found"
        }
      }
    }

    # F2: Event listener error capture
    if ($tsContent -match '\.on\(' -and $tsContent -notmatch 'try\s*\{') {
      Warn "F2-EVENT-NO-CATCH" $relPath "" "File contains event listener (.on()) but no try-catch error capture"
    }

    # F3: Store read with default value
    if ($tsContent -match 'use\w+Store\s*\(' -and $tsContent -notmatch '\?\?' -and $tsContent -notmatch '\?\.' -and $tsFile.Name -ne 'store.ts') {
      Warn "F3-STORE-NO-DEFAULT" $relPath "" "File reads Store but does not use ?? or ?. to provide default value"
    }
  }
}

$archErrors = $E.Errors - $archStartErrors
$archWarnings = $E.Warnings - $archStartWarnings
Write-Host "                    : $archErrors       , $archWarnings       " -ForegroundColor $(if ($archErrors -gt 0) { "Red" } else { "Green" })

# ============================================================
# Post-pass 5: Pattern Management Layer Check (D18)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 5: D18 Pattern Management Layer ---" -ForegroundColor Cyan

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

# ============================================================
# Post-pass 6: manifest pure declarative check (G9)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 6: G9 Manifest Purity ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $mp = Join-Path $md.FullName "manifest.ts"
  if (-not (Test-Path $mp)) { continue }
  $mc = Get-FileContent $mp
  if ($mc -match 'export const\s') {
    Fail "G9-MANIFEST-IMPL" $mn "" "manifest.ts contains 'export const' - manifest should be pure declaration"
  }
  if ($mc -match 'export function\s') {
    Fail "G9-MANIFEST-IMPL" $mn "" "manifest.ts contains 'export function' - manifest should be pure declaration"
  }
  if ($mc -notmatch 'defineMod\(') {
    Fail "G9-MANIFEST-DEFINE" $mn "" "manifest.ts should use defineMod() wrapper"
  }
}

# ============================================================
# Post-pass 7: Prompt file purity check (G10)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 7: G10 Prompt File Purity ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $promptsDir = Join-Path $md.FullName "prompts"
  if (-not (Test-Path $promptsDir)) { continue }
  $promptFiles = @(Get-ChildItem -Path $promptsDir -Filter "*.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "index.ts" })
  foreach ($pf in $promptFiles) {
    $pc = Get-FileContent $pf.FullName
    $pfRel = "src/mods/${mn}/prompts/$($pf.Name)"
    if ($pc -match 'export interface\s') {
      Warn "G10-PROMPT-TYPE" $pfRel "" "Prompt file also owns an exported interface; keep it with the prompt unless a separate shared contract owner is needed"
    }
    if ($pc -match 'export type\s') {
      Warn "G10-PROMPT-TYPE" $pfRel "" "Prompt file also owns an exported type; keep it with the prompt unless a separate shared contract owner is needed"
    }
    if ($pc -match 'export class\s') {
      Fail "G10-PROMPT-CLASS" $pfRel "" "Prompt file contains 'export class' - should only contain PromptTemplate objects"
    }
  }
}

# ============================================================
# Post-pass 8: Internal types should not export (H2)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 8: H2 Internal Type Export ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $typesPath = Join-Path $md.FullName "types.ts"
  if (-not (Test-Path $typesPath)) { continue }
  $tc = Get-FileContent $typesPath
  $internalTypeMatches = [regex]::Matches($tc, 'export (?:interface|type|enum)\s+(\w*(?:Internal|Cache|Private)\w*)')
  foreach ($itm in $internalTypeMatches) {
    $typeName = $itm.Groups[1].Value
    Warn "H2-INTERNAL-EXPORT" $mn "" "types.ts exports '$typeName' which appears to be internal (contains Internal/Cache/Private)"
  }
}

# ============================================================
