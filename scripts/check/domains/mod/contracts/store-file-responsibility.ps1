# Purpose: Validate that store.ts does not own exported type declarations.
# Owner: quality:mod
# Responsibility: G6 store type-export assertions only.

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName
  # G6: store.ts purity check
  $storePath = Join-Path $modPath "store.ts"
  if (Test-Path $storePath) {
    $storeContent = Get-FileContent $storePath
    if ($storeContent -match 'export (?:interface|type|enum)\s') {
      Warn "G6-STORE-TYPE" $modName "" "store.ts contains type definitions, recommend extracting to types.ts"
    }
  }
}
