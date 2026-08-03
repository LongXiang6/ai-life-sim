# Purpose: Validate that required Manifest dependencies resolve to real MOD directories.
# Owner: quality:mod
# Responsibility: D30 dependency existence assertions only.

# D30-DEP-EXISTS: declared dependencies must exist as MODs in the project
#
Write-Host ""
Write-Host "--- D30-DEP-EXISTS: dependency existence check ---" -ForegroundColor Cyan
$actualModDirs = @($modDirs | ForEach-Object { $_.Name })
foreach ($mn in $modNames) {
  $info = $AllManifests[$mn]
  foreach ($dep in $info.dependencies) {
    $depName = Resolve-ModDependencyName $dep
    if ($dep.Trim().StartsWith('?') -and $depName -notin $actualModDirs) { continue }
    if ($depName -notin $actualModDirs) {
      Fail "D30-DEP-EXISTS" $mn "" "declared dependency '$dep' does not exist as a MOD in src/mods/"
    }
  }
}
