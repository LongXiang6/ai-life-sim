# Purpose: Validate MOD import, lifecycle, event, capability, and store wiring.
# Owner: quality:mod
# Responsibility: D6-D10 smart-scanner rules only.

# === D6: Import path resolution ===
Write-Host "  [D6] Checking import paths..." -ForegroundColor DarkGray

# $allTsFiles shared from orchestrator if available, else compute
if (-not $AllSrcFiles) {
  $AllSrcFiles = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' })
}
$allTsFiles = $AllSrcFiles

foreach ($f in $allTsFiles) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $fileDir = Split-Path $f.FullName -Parent
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  $importMatches = [regex]::Matches($fc, "from\s+'([^']+)'")
  foreach ($im in $importMatches) {
    $importPath = $im.Groups[1].Value
    if ($importPath -notmatch '^[.@]') { continue }

    $resolved = $null

    if ($importPath -match '^@/(.+)') {
      $resolved = Join-Path $SrcDir $Matches[1]
    } elseif ($importPath -match '^\.\.?/') {
      $combined = Join-Path $fileDir $importPath
      $resolved = [System.IO.Path]::GetFullPath($combined)
    }

    if ($resolved -and -not (Test-FileExists $resolved)) {
      Fail "D6-IMPORT" $relFP "" "Import path not found: '$importPath'"
    }
  }
}

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

# === D8: Event emit/listen pairing ===
Write-Host "  [D8] Checking event pairing..." -ForegroundColor DarkGray

$allEmits = @{}
$allListens = @{}

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  foreach ($ev in $info.Emits) {
    if (-not $allEmits.ContainsKey($ev)) { $allEmits[$ev] = @() }
    $allEmits[$ev] += $mn
  }
  foreach ($ev in $info.Listens) {
    if (-not $allListens.ContainsKey($ev)) { $allListens[$ev] = @() }
    $allListens[$ev] += $mn
  }
}

foreach ($evt in $allEmits.Keys) {
  if (-not $allListens.ContainsKey($evt)) {
    Warn "D8-ORPHAN-EMIT" ($allEmits[$evt] -join ",") "" "event '$evt' emitted but never listened"
  }
}

foreach ($evt in $allListens.Keys) {
  if (-not $allEmits.ContainsKey($evt)) {
    if ($evt -eq "core:all-mods-loaded") {
      Pass "D8-LISTEN" ($allListens[$evt] -join ",") "listens core:all-mods-loaded (core event by loader)"
    } else {
      Fail "D8-ORPHAN-LISTEN" ($allListens[$evt] -join ",") "" "event '$evt' listened but never emitted"
    }
  }
}

# === D9: provides/consumes consistency ===
Write-Host "  [D9] Checking provides/consumes..." -ForegroundColor DarkGray

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]

  if ($info.Consumes.Count -gt 0) {
    foreach ($cap in $info.Consumes) {
      # 内联搜索 provider（避免 PowerShell 哈希表在 dot-source 链中的赋值失效 bug）
      $provider = $null
      foreach ($otherMn in $AllModInfo.Keys) {
        if ($cap -in $AllModInfo[$otherMn].Provides) {
          $provider = $otherMn
          break
        }
      }
      if (-not $provider) {
        Fail "D9-CONSUME" $mn "" "consumes '$cap' not provided by any MOD in registry"
        continue
      }
      $resolvedDeps = @($info.Deps | ForEach-Object { Resolve-ModDependencyName $_ })
      if ($provider -notin $resolvedDeps) {
        Warn "D9-CONSUME-DEP" $mn "" "consumes '$cap' from '$provider' but no dependency on provider - add '~ $provider' or hard dependency"
      }
    }
  }

  if ($info.Provides.Count -gt 0) {
    $ic = $info.IndexContent
    $modShort = $mn -replace '^mod-', ''
    foreach ($cap in $info.Provides) {
      $inSubsystem = $cap -in $info.SubsystemIds
      $inNamespace = ($cap -eq $modShort) -or ($cap -like "$modShort-*")
      $inIndex = $ic -and ($ic -match [regex]::Escape($cap))
      $consumedByAnotherMod = @($AllModInfo.Values | Where-Object { $cap -in $_.Consumes }).Count -gt 0
      if (-not $inSubsystem -and -not $inNamespace -and -not $inIndex -and -not $consumedByAnotherMod) {
        Fail "D9-PROVIDE" $mn "" "provides '$cap' not matched by subsystem id, mod namespace '$modShort', or index.ts export"
      }
    }
  }
}

# === D10: Store registration chain ===
Write-Host "  [D10] Checking store chain..." -ForegroundColor DarkGray

$globalSlicesPath = Join-Path $SrcDir "core/global-store/slices/index.ts"
$globalSlicesContent = ""
if (Test-Path $globalSlicesPath) {
  $globalSlicesContent = Get-FileContent $globalSlicesPath
}

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  if ($info.Stores.Count -eq 0) { continue }

  $storePath = Join-Path $info.Path "store.ts"

  if (-not (Test-Path $storePath)) {
    Fail "D10-STORE-FILE" $mn "" "manifest declares stores but store.ts missing"
    continue
  }

  $sc = Get-FileContent $storePath

  foreach ($st in $info.Stores) {
    if ($sc -notmatch [regex]::Escape($st)) {
      Fail "D10-STORE-EXPORT" $mn "" "store '$st' not found in store.ts"
    }

    $ic = $info.IndexContent
    if ($ic -and ($ic -notmatch [regex]::Escape($st))) {
      Warn "D10-STORE-INDEX" $mn "" "store '$st' not re-exported in index.ts"
    }
  }

  if ($globalSlicesContent) {
    $anyWired = $false
    foreach ($st in $info.Stores) {
      if ($globalSlicesContent -match [regex]::Escape($st)) {
        $anyWired = $true
        break
      }
    }
    if (-not $anyWired) {
      Warn "D10-STORE-WIRING" $mn "" "stores not wired in core/global-store/slices/index.ts"
    }
  }
}
