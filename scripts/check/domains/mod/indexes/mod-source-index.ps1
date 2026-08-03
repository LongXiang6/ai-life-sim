# Purpose: Build one cached per-MOD source record index for import and storage contracts.
# Owner: quality:mod
# Responsibility: Project cached source text into MOD-relative files, public MOD imports, and storage-key literals only.

$ModSourceIndex = @{}
foreach ($modDirectory in $modDirs) {
  $modName = $modDirectory.Name
  $modPath = $modDirectory.FullName
  $modPathPrefix = $modPath + [System.IO.Path]::DirectorySeparatorChar
  $records = [System.Collections.ArrayList]::new()
  $crossModNames = [System.Collections.Generic.HashSet[string]]::new()

  foreach ($sourceFile in @($AllSrcFiles | Where-Object {
    $_.FullName.StartsWith($modPathPrefix, [System.StringComparison]::OrdinalIgnoreCase)
  })) {
    $content = Get-FileContent $sourceFile.FullName
    if (-not $content) { continue }
    $relativePath = "src/mods/${modName}/" + $sourceFile.FullName.Substring($modPath.Length + 1).Replace('\', '/')
    $isInactiveSubsystem = (
      $sourceFile.Directory.Name -eq 'subsystems' -and
      $sourceFile.Name -like '*-system.ts' -and
      -not (Test-IsActiveRuntimeSubsystemFile $sourceFile.FullName)
    )
    $skipCrossImports = (Test-IsGeneratedPublicBoundaryException $relativePath) -or $isInactiveSubsystem
    $crossImports = @()
    if (-not $skipCrossImports) {
      $crossImports = @(
        [regex]::Matches($content, "from\s+'@/mods/(mod-[a-z0-9-]+)(/.+?)?'") |
          ForEach-Object {
            $importedMod = $_.Groups[1].Value
            if ($importedMod -ne $modName) {
              [void]$crossModNames.Add($importedMod)
              [pscustomobject]@{ Mod = $importedMod; SubPath = $_.Groups[2].Value }
            }
          }
      )
    }

    $storageKeys = @(
      [regex]::Matches($content, "(['])(mod-[a-z0-9-]+:[a-z0-9-]+(?::[a-z0-9-]+){0,2})(['])") |
        ForEach-Object { $_.Groups[2].Value }
    )
    [void]$records.Add([pscustomobject]@{
      File = $sourceFile
      RelativePath = $relativePath
      Content = $content
      CrossImports = $crossImports
      StorageKeys = $storageKeys
    })
  }

  $ModSourceIndex[$modName] = [pscustomobject]@{
    Directory = $modDirectory
    Files = @($records)
    CrossModNames = $crossModNames
  }
}
