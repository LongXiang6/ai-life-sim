# Purpose: Diagnose runtime exports unused by the owning or dependent MODs.
# Owner: quality:mod
# Responsibility: D24-DEAD-EXPORT reachability assertions only.

# === D24: MOD internal dead export detection ===
Write-Host "  [D24] Checking MOD-internal dead exports..." -ForegroundColor DarkGray
$reverseDeps = @{}
foreach ($modName in $AllModInfo.Keys) {
  $reverseDeps[$modName] = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::Ordinal
  )
}
foreach ($consumerMod in $AllModInfo.Keys) {
  foreach ($dependency in $AllModInfo[$consumerMod].Deps) {
    $dependencyMod = Resolve-ModDependencyName $dependency
    if ($reverseDeps.ContainsKey($dependencyMod)) {
      [void]$reverseDeps[$dependencyMod].Add($consumerMod)
    }
  }
}

$exportRecords = [System.Collections.ArrayList]::new()
$candidateNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($modName in @($AllModInfo.Keys | Sort-Object)) {
  foreach ($modFile in @($modFilesByName[$modName] | Sort-Object FullName)) {
    if ($modFile.Name -match '^index\.' -or $modFile.FullName -match '[\\/]_internal[\\/]' -or
        $modFile.Name -match '\.types\.') { continue }
    $fileContent = $sourceContentByPath[$modFile.FullName]
    foreach ($exportMatch in [regex]::Matches($fileContent, 'export\s+(?:const|function|class|let|var)\s+([A-Za-z_]\w*)')) {
      $exportName = $exportMatch.Groups[1].Value
      if ($exportName -match '^(loadOrder|name|version|description|dependencies|provides|consumes|subsystems|routes|stores|events|prompts)$') { continue }
      [void]$candidateNames.Add($exportName)
      [void]$exportRecords.Add([PSCustomObject]@{
        File = $modFile.FullName
        Mod = $modName
        Name = $exportName
      })
    }
  }
}

$identifierFiles = @{}
foreach ($sourcePath in @($sourceContentByPath.Keys | Sort-Object)) {
  $fileIdentifiers = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($identifierMatch in [regex]::Matches($sourceContentByPath[$sourcePath], '\b[A-Za-z_][A-Za-z0-9_]*\b')) {
    $identifier = $identifierMatch.Value
    if ($candidateNames.Contains($identifier)) { [void]$fileIdentifiers.Add($identifier) }
  }
  foreach ($identifier in $fileIdentifiers) {
    if (-not $identifierFiles.ContainsKey($identifier)) {
      $identifierFiles[$identifier] = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::OrdinalIgnoreCase
      )
    }
    [void]$identifierFiles[$identifier].Add($sourcePath)
  }
}

$pagesConsumer = $AllModInfo.ContainsKey('mod-pages')
foreach ($record in @($exportRecords | Sort-Object File, Name)) {
  $allowedConsumers = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  [void]$allowedConsumers.Add($record.Mod)
  foreach ($dependentMod in $reverseDeps[$record.Mod]) { [void]$allowedConsumers.Add($dependentMod) }
  if ($pagesConsumer -and $record.Mod -ne 'mod-pages') { [void]$allowedConsumers.Add('mod-pages') }

  $referenced = $false
  if ($identifierFiles.ContainsKey($record.Name)) {
    foreach ($referencePath in $identifierFiles[$record.Name]) {
      if ([string]::Equals($referencePath, $record.File, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
      if ($fileModByPath.ContainsKey($referencePath) -and
          $allowedConsumers.Contains($fileModByPath[$referencePath])) {
        $referenced = $true
        break
      }
    }
  }
  if (-not $referenced) {
    $relativePath = $record.File.Substring($SrcDir.Length + 1).Replace('\', '/')
    Warn 'D24-DEAD-EXPORT' "src/$relativePath" '' "Export '$($record.Name)' not referenced in another file of the owning or dependent MODs"
  }
}
