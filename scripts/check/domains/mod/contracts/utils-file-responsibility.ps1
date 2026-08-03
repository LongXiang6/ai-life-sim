# Purpose: Validate that utils.ts remains a utility-oriented contract file.
# Owner: quality:mod
# Responsibility: G3 type, constant, and React Hook assertions only.

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName
  # G3: utils.ts purity check
  $utilsPath = Join-Path $modPath "utils.ts"
  if (Test-Path $utilsPath) {
    $utilsContent = Get-FileContent $utilsPath
    if ($utilsContent -match 'export (?:interface|type|enum)\s') {
      Warn "G3-UTILS-TYPE" $modName "" "utils.ts contains type definitions, recommend extracting to types.ts"
    }
    if ($utilsContent -match 'export const [A-Z_]+\s*=') {
      Warn "G3-UTILS-CONST" $modName "" "utils.ts contains constant definitions, recommend extracting to constants.ts"
    }
    if ($utilsContent -match 'use[A-Z]\w+\s*\(') {
      Fail "G3-UTILS-HOOK" $modName "" "utils.ts contains React Hook, utility files should not contain Hooks"
    }
  }
}
