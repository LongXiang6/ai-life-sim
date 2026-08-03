# Purpose: Validate subsystem read boundaries, private exports, mobile separation, and duplicate utilities.
# Owner: quality:mod
# Responsibility: Architecture post-passes 9 through 13 and final scanner summary only.

# Post-pass 9: applyChanges cross-subsystem read check (C17)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 9: C17 applyChanges Cross-Subsystem Read ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $subDir = Join-Path $md.FullName "subsystems"
  if (-not (Test-Path $subDir)) { continue }
  $subFiles = @(Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
  foreach ($sf in $subFiles) {
    $sc = Get-FileContent $sf.FullName
    # Find applyChanges method body
    $acMatch = [regex]::Match($sc, 'applyChanges\([\s\S]*?\{([\s\S]*?)\n\s*\}')
    if ($acMatch.Success) {
      $acBody = $acMatch.Groups[1].Value
      # Check for cross-subsystem store reads
      if ($acBody -match 'use\w+Store\s*\(') {
        Warn "C17-CROSS-SUBSYSTEM" "src/mods/${mn}/subsystems/$($sf.Name)" "" "applyChanges() reads another Store, subsystems should only operate on own data"
      }
    }
  }
}

# ============================================================
# Post-pass 10: Private constants shouldn't export (H3)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 10: H3 Private Constant Export ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $constPath = Join-Path $md.FullName "constants.ts"
  if (-not (Test-Path $constPath)) { continue }
  $cc = Get-FileContent $constPath
  $privateConstMatches = [regex]::Matches($cc, 'export const ([A-Z][A-Z0-9_]*(?:INTERNAL|PRIVATE|TEMP|DEBUG)[A-Z0-9_]*)')
  foreach ($pcm in $privateConstMatches) {
    $constName = $pcm.Groups[1].Value
    Warn "H3-PRIVATE-CONST" $mn "" "constants.ts exports '$constName' which appears to be internal (contains INTERNAL/PRIVATE/TEMP/DEBUG)"
  }
}

# ============================================================
# Post-pass 11: Subsystem helper functions shouldn't export (H4)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 11: H4 Subsystem Helper Export ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $subDir = Join-Path $md.FullName "subsystems"
  if (-not (Test-Path $subDir)) { continue }
  $subFiles = @(Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
  foreach ($sf in $subFiles) {
    $sc = Get-FileContent $sf.FullName
    $helperExports = [regex]::Matches($sc, 'export (?:function|const)\s+(\w+)')
    foreach ($he in $helperExports) {
      $helperName = $he.Groups[1].Value
      # Skip subsystem class definitions.
      if ($sc -match "class\s+$helperName\s+(?:implements\s+ISubSystem\b|extends\s+BaseSubsystem\b)") { continue }
      # Skip known exception patterns
      if ($helperName -match 'System$') { continue }
      Warn "H4-HELPER-EXPORT" "src/mods/${mn}/subsystems/$($sf.Name)" "" "subsystem exports helper '$helperName', consider removing export or moving to utils.ts"
    }
  }
}

# ============================================================
# Post-pass 12: PC/Mobile separation check (U5)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 12: U5 PC/Mobile Separation ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $componentsDir = Join-Path $md.FullName "components"
  if (-not (Test-Path $componentsDir)) { continue }
  $organismsDir = Join-Path $componentsDir "organisms"
  if (-not (Test-Path $organismsDir)) { continue }

  $orgFiles = @(Get-ChildItem -Path $organismsDir -Filter "*.tsx" -File | Where-Object { $_.Name -notmatch "\.types\.|^index\.|\.desktop\.|\.mobile\." })
  foreach ($of in $orgFiles) {
    $baseName = $of.Name -replace '\.tsx$', ''
    $desktopFile = Join-Path $organismsDir "${baseName}.desktop.tsx"
    $mobileFile = Join-Path $organismsDir "${baseName}.mobile.tsx"
    $selectorFile = Join-Path $organismsDir "${baseName}.tsx"
    if (-not (Test-Path $desktopFile)) {
      Warn "U5-PC-SPLIT" $mn "" "Organism '$baseName' missing ${baseName}.desktop.tsx"
    }
    if (-not (Test-Path $mobileFile)) {
      Warn "U5-PC-SPLIT" $mn "" "Organism '$baseName' missing ${baseName}.mobile.tsx"
    }
  }
}

# ============================================================
# Post-pass 13: G5 Duplicate Utility Function Detection
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 13: G5 Duplicate Utility Check ---" -ForegroundColor Cyan

# Collect all exported function/const names from foundation/utils/
$foundationUtilsDir = Join-Path $SrcDir "foundation\utils"
$foundationExports = @{}
if (Test-Path $foundationUtilsDir) {
  $foundationUtilFiles = @(Get-ChildItem -Path $foundationUtilsDir -Filter "*.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "index.ts" })
  foreach ($fuf in $foundationUtilFiles) {
    $fufContent = Get-FileContent $fuf.FullName
    if (-not $fufContent) { continue }
    $fufRel = "src/foundation/utils/$($fuf.Name)"
    # Match: export function foo or export const foo =
    $fufExports = [regex]::Matches($fufContent, 'export\s+(?:function|const)\s+(\w+)')
    foreach ($fe in $fufExports) {
      $fname = $fe.Groups[1].Value
      $foundationExports[$fname] = $fufRel
    }
  }
}

# Also check old foundation/utils.ts directly
$foundationUtilsFile = Join-Path $SrcDir "foundation\utils.ts"
if (Test-Path $foundationUtilsFile) {
  $fuContent = Get-FileContent $foundationUtilsFile
  if ($fuContent) {
    $fuExports = [regex]::Matches($fuContent, 'export\s+(?:function|const)\s+(\w+)')
    foreach ($fe in $fuExports) {
      $fname = $fe.Groups[1].Value
      if (-not $foundationExports.ContainsKey($fname)) {
        $foundationExports[$fname] = "src/foundation/utils.ts"
      }
    }
  }
}

if ($foundationExports.Count -gt 0) {
  # Scan each MOD's utils.ts for duplicates
  foreach ($md in $modDirs) {
    $mn = $md.Name
    $utilsPath = Join-Path $md.FullName "utils.ts"
    if (-not (Test-Path $utilsPath)) { continue }
    $utilsContent = Get-FileContent $utilsPath
    if (-not $utilsContent) { continue }
    $modUtilRel = "src/mods/${mn}/utils.ts"

    $modExports = [regex]::Matches($utilsContent, 'export\s+(?:function|const)\s+(\w+)')
    foreach ($me in $modExports) {
      $fn = $me.Groups[1].Value
      if ($foundationExports.ContainsKey($fn)) {
        $delegateImport = [regex]::Match($utilsContent, "import\s*\{\s*$([regex]::Escape($fn))\s+as\s+(\w+)\s*\}\s*from\s*'@/foundation'")
        if ($delegateImport.Success -and $utilsContent -match "return\s+$([regex]::Escape($delegateImport.Groups[1].Value))\s*\(") {
          Pass 'G5-DUPLICATE-UTIL' $modUtilRel "compatibility wrapper '$fn' delegates to foundation"
        } else {
          Fail "G5-DUPLICATE-UTIL" $modUtilRel "" "Function '$fn' duplicates foundation implementation ($($foundationExports[$fn])) instead of delegating"
        }
      }
    }
  }
  Pass "G5-DUPLICATE-UTIL" "foundation" "Checked $($foundationExports.Count) foundation exports against MOD utils.ts files"
} else {
  Warn "G5-DUPLICATE-UTIL" "foundation" "" "No foundation utility exports found to compare against"
}
