# Purpose: Validate that manifest.ts remains a declarative defineMod contract.
# Owner: quality:mod
# Responsibility: G9 Manifest implementation and defineMod assertions only.

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
