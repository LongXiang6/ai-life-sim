# Purpose: Validate that constants.ts remains a constant-oriented contract file.
# Owner: quality:mod
# Responsibility: G2 type and helper-function assertions only.

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName
  # G2: constants.ts purity check
  $constPath = Join-Path $modPath "constants.ts"
  if (Test-Path $constPath) {
    $constContent = Get-FileContent $constPath
    if ($constContent -match 'export (?:interface|type|enum)\s') {
      Warn "G2-CONST-TYPE" $modName "" "constants.ts contains type exports; consider moving them when the owning contract is next changed"
    }
    if ($constContent -match 'export (?:function|const\s+\w+\s*=\s*\()') {
      Warn "G2-CONST-FUNC" $modName "" "constants.ts contains helper functions; consider moving them when the owning contract is next changed"
    }
  }
}
