# Purpose: Build one Manifest dependency index and normalize dependency prefixes.
# Owner: quality:mod
# Responsibility: Resolve dependency names and project Manifest load-order/dependency metadata only.

function Resolve-ModDependencyName($dependency) {
  $resolved = $dependency.Trim()
  if ($resolved.StartsWith('~') -or $resolved.StartsWith('?') -or $resolved.StartsWith('!')) {
    return $resolved.Substring(1).Trim()
  }
  return $resolved
}
$AllManifests = @{}
foreach ($modDirectory in $modDirs) {
  $manifestPath = Join-Path $modDirectory.FullName 'manifest.ts'
  if (-not (Test-Path $manifestPath)) { continue }
  $manifestContent = Get-FileContent $manifestPath
  $loadOrderMatch = [regex]::Match($manifestContent, 'loadOrder:\s*(\d+)')
  $AllManifests[$modDirectory.Name] = @{
    name = $modDirectory.Name
    loadOrder = if ($loadOrderMatch.Success) { [int]$loadOrderMatch.Groups[1].Value } else { -1 }
    dependencies = @(Get-DeclaredStringArray $manifestContent 'dependencies')
  }
}
