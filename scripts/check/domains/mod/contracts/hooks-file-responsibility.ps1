# Purpose: Validate that hooks.ts does not own shared types or constants.
# Owner: quality:mod
# Responsibility: G7 hook-file type and constant assertions only.

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName
  # G7: hooks.ts purity check
  $hooksPath = Join-Path $modPath "hooks.ts"
  if (Test-Path $hooksPath) {
    $hooksContent = Get-FileContent $hooksPath
    if ($hooksContent -match 'export (?:interface|type|enum)\s') {
      Warn "G7-HOOKS-TYPE" $modName "" "hooks.ts contains type definitions, recommend extracting to types.ts"
    }
    if ($hooksContent -match 'export const [A-Z_]+\s*=') {
      Warn "G7-HOOKS-CONST" $modName "" "hooks.ts contains constant definitions, recommend extracting to constants.ts"
    }
  }
}
