# Purpose: Validate Manifest subsystem declarations against source and generated registration.
# Owner: quality:mod
# Responsibility: D7 subsystem directory, class, index, and generated importer assertions only.

# === D7: Subsystem lifecycle chain ===
Write-Host "  [D7] Checking subsystem chain..." -ForegroundColor DarkGray

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  if ($info.Subsystems.Count -eq 0) { continue }

  $subDir = Join-Path $info.Path "subsystems"

  if (-not (Test-Path $subDir)) {
    Fail "D7-SUBDIR" $mn "" "manifest declares subsystems but subsystems/ dir missing"
    continue
  }

  $subFiles = @(Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
  $actualClasses = @{}
  foreach ($sf in $subFiles) {
    $sc = Get-FileContent $sf.FullName
    # Match staged subsystem classes: new BaseSubsystem or legacy ISubSystem.
    if ($sc -match "export class (\w+)\s+(?:extends\s+BaseSubsystem\b|implements\s+ISubSystem\b)") {
      $actualClasses[$Matches[1]] = $sf.Name
    }
  }

  foreach ($decl in $info.Subsystems) {
    if (-not $actualClasses.ContainsKey($decl)) {
      Fail "D7-SUBCLASS" $mn "" "manifest declares '$decl' but no class found in subsystems/"
    }
  }
  foreach ($cls in $actualClasses.Keys) {
    if ($cls -notin $info.Subsystems) {
      Warn "D7-SUBCLASS-EXTRA" $mn "" "subsystems/$($actualClasses[$cls]) has '$cls' not registered in manifest"
    }
  }

  $siPath = Join-Path $subDir "index.ts"
  if (Test-Path $siPath) {
    $sic = Get-FileContent $siPath
    foreach ($cls in $info.Subsystems) {
      if ($actualClasses.ContainsKey($cls)) {
        # Check if the class name is actually exported in subsystems/index.ts
        $classFileBase = $actualClasses[$cls] -replace '\.ts$', ''
        if ($sic -notmatch [regex]::Escape($cls) -and $sic -notmatch [regex]::Escape($classFileBase)) {
          Warn "D7-SUBSINDEX" $mn "" "subsystem '$cls' not exported in subsystems/index.ts"
        }
      }
    }
  } else {
    $missingGeneratedImports = @()
    foreach ($cls in $info.Subsystems) {
      if (-not $actualClasses.ContainsKey($cls)) { continue }
      $classFileBase = $actualClasses[$cls] -replace '\.ts$', ''
      $hasGeneratedImport = $generatedSubsystemImporterContent -match [regex]::Escape("@/mods/${mn}/subsystems/${classFileBase}")
      if ($mn -eq 'mod-engine') {
        $hasGeneratedImport = $hasGeneratedImport -or (
          $generatedEngineSubsystemContent -match [regex]::Escape("../subsystems/${classFileBase}")
        )
        if ($classFileBase -eq 'orchestrator-system') {
          $hasGeneratedImport = $hasGeneratedImport -or (
            $engineSubsystemRegistrationContent -match [regex]::Escape("../subsystems/${classFileBase}")
          )
        }
      }
      if (-not $hasGeneratedImport) {
        $missingGeneratedImports += $classFileBase
      }
    }
    if ($missingGeneratedImports.Count -eq 0) {
      Pass 'D7-SUBSINDEX' $mn 'code-generated subsystem importer owns registration; no manual subsystems/index.ts required'
    } else {
      Fail 'D7-SUBSINDEX' $mn '' "generated subsystem importer is missing: $($missingGeneratedImports -join ', ')"
    }
  }

  $modIdxPath2 = Join-Path $info.Path "index.ts"
  if ((Test-Path $modIdxPath2) -and (-not $info.HasSubsReExport)) {
    Warn "D7-MODINDEX" $mn "" "index.ts missing re-export from ./subsystems"
  }
}
