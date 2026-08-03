# Purpose: Compare cross-MOD source imports with Manifest lifecycle dependencies.
# Owner: quality:mod
# Responsibility: D2 missing and unused dependency assertions only.

foreach ($modName in $ModSourceIndex.Keys) {
  $sourceIndex = $ModSourceIndex[$modName]
  $manifestPath = Join-Path $sourceIndex.Directory.FullName 'manifest.ts'
  if (-not (Test-Path $manifestPath)) { continue }
  $declaredDependencies = @(Get-DeclaredStringArray (Get-FileContent $manifestPath) 'dependencies')

  foreach ($importedMod in $sourceIndex.CrossModNames) {
    if ($importedMod -notin $declaredDependencies) {
      Warn 'D2-DEP-MISSING' $modName '' "public source import from '$importedMod' has no lifecycle dependency declaration; add one only when load ordering is required"
    }
  }

  foreach ($dependency in $declaredDependencies) {
    if ($sourceIndex.CrossModNames.Contains($dependency)) { continue }
    $dependencyUsed = $false
    foreach ($record in $sourceIndex.Files) {
      if ($record.Content -match [regex]::Escape("@/mods/${dependency}")) {
        $dependencyUsed = $true
        break
      }
    }
    if (-not $dependencyUsed) {
      Pass 'D2-DEP-UNUSED' $modName "manifest              '$dependency'                                               RoundContext          "
    }
  }
}
