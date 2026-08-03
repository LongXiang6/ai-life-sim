# Purpose: Diagnose internal-looking types exported from a MOD public type file.
# Owner: quality:mod
# Responsibility: H2 internal type-name export assertions only.

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
