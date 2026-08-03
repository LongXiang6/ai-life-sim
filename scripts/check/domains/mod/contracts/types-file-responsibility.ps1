# Purpose: Validate that types.ts remains a type-oriented contract file.
# Owner: quality:mod
# Responsibility: G1 runtime, React, and Next.js dependency assertions only.

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName
  # G1: types.ts purity check
  $typesPath = Join-Path $modPath "types.ts"
  if (Test-Path $typesPath) {
    $typesContent = Get-FileContent $typesPath
    if ($typesContent -match 'export (?:const|function|class)\s') {
      Warn "G1-TYPES-FUNC" $modName "" "types.ts contains runtime exports; consider moving them when the owning contract is next changed"
    }
    if ($typesContent -match "from\s+'react'") {
      Fail "G1-TYPES-REACT" $modName "" "types.ts imports React, type files should not have runtime dependencies"
    }
    if ($typesContent -match "from\s+'next") {
      Warn "G1-TYPES-NEXT" $modName "" "types.ts imports Next.js, recommend avoiding runtime dependencies"
    }
  }
}
