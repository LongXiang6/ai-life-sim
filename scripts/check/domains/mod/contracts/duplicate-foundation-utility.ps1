# Purpose: Detect MOD utility exports that duplicate foundation implementations.
# Owner: quality:mod
# Responsibility: G5 duplicate utility and delegation assertions only.

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
