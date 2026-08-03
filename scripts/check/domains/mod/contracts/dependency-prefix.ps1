# Purpose: Validate optional, soft, and incompatible Manifest dependency prefixes.
# Owner: quality:mod
# Responsibility: D33 dependency prefix existence and contradiction assertions only.

# === D33: Dependency prefix validation (~/?/!)
Write-Host "  [D33] Checking dependency prefix conventions..." -ForegroundColor DarkGray

$d33StartErrors = $E.Errors
$d33StartWarnings = $E.Warnings

# Build list of all MOD names (including those in modsDir, not just registered)
$allModNamesA33 = @{}
foreach ($md in $modDirs) { $allModNamesA33[$md.Name] = $true }

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  if ($info.Deps.Count -eq 0) { continue }

  foreach ($dep in $info.Deps) {
    $trimmed = $dep.Trim()
    if ($trimmed.StartsWith('~') -or $trimmed.StartsWith('?') -or $trimmed.StartsWith('!')) {
      $baseName = Resolve-ModDependencyName $dep

      if (-not $allModNamesA33.ContainsKey($baseName)) {
        Fail "D33-DEP-PREFIX" $mn "" "Dependency '$dep' uses prefix but base MOD '$baseName' does not exist in src/mods/"
      }

      if ($trimmed.StartsWith('!')) {
        $resolvedDeps = @($info.Deps | ForEach-Object { Resolve-ModDependencyName $_ })
        if ($resolvedDeps -contains $baseName -and ($info.Deps -contains $baseName)) {
    Warn "D33-DEP-PREFIX" $mn "" "Dependency '$baseName' listed as both incompatible ('!') and normal - inconsistent dependency declaration"
        }
      }
    }
  }
}
