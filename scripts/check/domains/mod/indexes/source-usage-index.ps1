# Purpose: Build one cached TypeScript source ownership and identifier-usage index.
# Owner: quality:mod
# Responsibility: Map cached source text to MOD owners and MOD file lists for reachability contracts only.

$allTsFiles2 = $AllSrcFiles
$sourceContentByPath = @{}
$fileModByPath = @{}
$modFilesByName = @{}
foreach ($modName in $AllModInfo.Keys) { $modFilesByName[$modName] = @() }

foreach ($sourceFile in @($allTsFiles2 | Sort-Object FullName)) {
  $sourceContent = Get-FileContent $sourceFile.FullName
  if (-not $sourceContent) { continue }
  $sourceContentByPath[$sourceFile.FullName] = $sourceContent
  $relativePath = $sourceFile.FullName.Substring($SrcDir.Length + 1).Replace('\', '/')
  if ($relativePath -notmatch '^mods/(mod-[a-z0-9-]+)/') { continue }
  $ownerMod = $Matches[1]
  $fileModByPath[$sourceFile.FullName] = $ownerMod
  if ($modFilesByName.ContainsKey($ownerMod)) {
    $modFilesByName[$ownerMod] += $sourceFile
  }
}

$identifierFilesByName = @{}
foreach ($sourcePath in @($sourceContentByPath.Keys | Sort-Object)) {
  $fileIdentifiers = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($identifierMatch in [regex]::Matches($sourceContentByPath[$sourcePath], '\b[A-Za-z_][A-Za-z0-9_]*\b')) {
    [void]$fileIdentifiers.Add($identifierMatch.Value)
  }
  foreach ($identifier in $fileIdentifiers) {
    if (-not $identifierFilesByName.ContainsKey($identifier)) {
      $identifierFilesByName[$identifier] = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::OrdinalIgnoreCase
      )
    }
    [void]$identifierFilesByName[$identifier].Add($sourcePath)
  }
}
