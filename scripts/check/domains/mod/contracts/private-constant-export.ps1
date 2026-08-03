# Purpose: Diagnose internal-looking constants exported from a MOD constant file.
# Owner: quality:mod
# Responsibility: H3 private constant-name export assertions only.

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
