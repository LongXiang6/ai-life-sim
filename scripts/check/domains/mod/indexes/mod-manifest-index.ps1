# Purpose: Build one parsed MOD Manifest and generated-subsystem wiring index.
# Owner: quality:mod
# Responsibility: Resolve file candidates and project Manifest, index, subsystem, event, and generated wiring metadata only.

function Test-FileExists($basePath) {
  if (Test-Path $basePath) { return $true }
  $extensions = ".ts", ".tsx", ".js", ".jsx"
  foreach ($ext in $extensions) {
    if (Test-Path ($basePath + $ext)) { return $true }
  }
  foreach ($ext in $extensions) {
    if (Test-Path (Join-Path $basePath ("index" + $ext))) { return $true }
  }
  return $false
}
# Pre-pass: collect manifest data
$AllModInfo = @{}

foreach ($md in $modDirs) {
  $mn = $md.Name
  $mp = Join-Path $md.FullName "manifest.ts"
  if (-not (Test-Path $mp)) { continue }

  $mc = Get-FileContent $mp
  $info = @{ Path = $md.FullName; ManContent = $mc }

  $info.Subsystems = @(Get-DeclaredStringArray $mc 'subsystems')
  $info.Stores = @(Get-DeclaredStringArray $mc 'stores')
  $info.Deps = @(Get-DeclaredStringArray $mc 'dependencies')
  $info.Provides = @(Get-DeclaredStringArray $mc 'provides')
  $info.Consumes = @(Get-DeclaredStringArray $mc 'consumes')

  $info.Emits = @()
  $info.Listens = @()
  $evtBlockMatch = [regex]::Match($mc, "events:\s*\{([\s\S]+?)\}")
  if ($evtBlockMatch.Success) {
    $evtBlock = $evtBlockMatch.Groups[1].Value
    $info.Emits = @(Get-DeclaredStringArray $evtBlock 'emits')
    $info.Listens = @(Get-DeclaredStringArray $evtBlock 'listens')
  }

  $ip = Join-Path $md.FullName "index.ts"
  if (Test-Path $ip) {
    $ic = Get-FileContent $ip
    $info.IndexContent = $ic
    $info.HasSubsReExport = ($ic -match "from\s+'\./subsystems'")
    $info.HasStoreReExport = ($ic -match "from\s+'\./store'")
  } else {
    $info.IndexContent = ""
    $info.HasSubsReExport = $false
    $info.HasStoreReExport = $false
  }

  $subsystemIds = @()
  $subDir = Join-Path $md.FullName "subsystems"
  if (Test-Path $subDir) {
    foreach ($sf in (Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })) {
      $sc = Get-FileContent $sf.FullName
      $idMatch = [regex]::Match($sc, "readonly id = '([^']+)'")
      if ($idMatch.Success) { $subsystemIds += $idMatch.Groups[1].Value }
    }
  }
  $info.SubsystemIds = $subsystemIds

  $AllModInfo[$mn] = $info
}
Write-Host "  Pre-pass: collected $($AllModInfo.Count) MOD manifests"
$generatedSubsystemImporterPath = Join-Path $SrcDir 'core\mod-loader\mod-subsystem-importers.generated.ts'
$generatedSubsystemImporterContent = if (Test-Path $generatedSubsystemImporterPath) {
  Get-FileContent $generatedSubsystemImporterPath
} else {
  ''
}
$generatedEngineSubsystemPath = Join-Path $SrcDir 'mods\mod-engine\bootstrap\engine-subsystems.generated.ts'
$generatedEngineSubsystemContent = if (Test-Path $generatedEngineSubsystemPath) {
  Get-FileContent $generatedEngineSubsystemPath
} else {
  ''
}
$engineSubsystemRegistrationPath = Join-Path $SrcDir 'mods\mod-engine\bootstrap\register-subsystems.ts'
$engineSubsystemRegistrationContent = if (Test-Path $engineSubsystemRegistrationPath) {
  Get-FileContent $engineSubsystemRegistrationPath
} else {
  ''
}
