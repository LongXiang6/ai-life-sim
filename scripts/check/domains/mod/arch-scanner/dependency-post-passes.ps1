# Purpose: Validate manifest dependency order, file responsibility purity, and dependency direction.
# Owner: quality:mod
# Responsibility: D3, G-class purity, and D24 architecture post-passes only.

# Post-pass: D3                   
#                                                                                                                                                                      
Write-Host ""
Write-Host "--- Post-pass: D3                    ---" -ForegroundColor Cyan
$modNames = $AllManifests.Keys
foreach ($mn in $modNames) {
  $info = $AllManifests[$mn]
  foreach ($dep in $info.dependencies) {
    if ($AllManifests.ContainsKey($dep) -and $dep -ne $mn) {
      $depInfo = $AllManifests[$dep]
      if ($depInfo.dependencies -contains $mn) {
        Fail "D3-CYCLE" $mn "" "               '$mn'     '$dep'                   "
      }
    }
  }
}
#                             Kahn          
$inDegree = @{}
$graph = @{}
foreach ($mn in $modNames) { $inDegree[$mn] = 0; $graph[$mn] = @() }
foreach ($mn in $modNames) {
  $info = $AllManifests[$mn]
  foreach ($dep in $info.dependencies) {
    if ($modNames -contains $dep) {
      $graph[$dep] += $mn  # dep     mn (dep must load before mn)
      $inDegree[$mn]++
    }
  }
}
$queue = [System.Collections.Queue]::new()
foreach ($mn in $modNames) {
  if ($inDegree[$mn] -eq 0) { $queue.Enqueue($mn) }
}
$visited = 0
while ($queue.Count -gt 0) {
  $node = $queue.Dequeue()
  $visited++
  foreach ($neighbor in $graph[$node]) {
    $inDegree[$neighbor]--
    if ($inDegree[$neighbor] -eq 0) { $queue.Enqueue($neighbor) }
  }
}
if ($visited -lt $modNames.Count) {
  $unvisited = $modNames | Where-Object { $inDegree[$_] -gt 0 }
  Fail "D3-CYCLE" "      " "" "                                  $($unvisited -join ', ')                      "
} else {
  Pass "D3-CYCLE" "      " "                              $visited     MOD                   "
}

#                                                                                                                                                                      
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

# ============================================================
# Post-pass 2: File Responsibility Purity Check (G-class)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 2: G File Purity Check ---" -ForegroundColor Cyan

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName

  # G1: types.ts purity check
  $typesPath = Join-Path $modPath "types.ts"
  if (Test-Path $typesPath) {
    $typesContent = Get-FileContent $typesPath
    if ($typesContent -match 'export (?:const|function|class)\s') {
      Warn "G1-TYPES-FUNC" $modName "" "types.ts contains runtime exports; consider moving them when the owning contract is next changed"
    }
    if ($typesContent -match "from\s+'react'") {
      Fail "G1-TYPES-REACT" $modName "" "types.ts imports React, type files should not have runtime dependencies"
    }
    if ($typesContent -match "from\s+'next") {
      Warn "G1-TYPES-NEXT" $modName "" "types.ts imports Next.js, recommend avoiding runtime dependencies"
    }
  }

  # G2: constants.ts purity check
  $constPath = Join-Path $modPath "constants.ts"
  if (Test-Path $constPath) {
    $constContent = Get-FileContent $constPath
    if ($constContent -match 'export (?:interface|type|enum)\s') {
      Warn "G2-CONST-TYPE" $modName "" "constants.ts contains type exports; consider moving them when the owning contract is next changed"
    }
    if ($constContent -match 'export (?:function|const\s+\w+\s*=\s*\()') {
      Warn "G2-CONST-FUNC" $modName "" "constants.ts contains helper functions; consider moving them when the owning contract is next changed"
    }
  }

  # G3: utils.ts purity check
  $utilsPath = Join-Path $modPath "utils.ts"
  if (Test-Path $utilsPath) {
    $utilsContent = Get-FileContent $utilsPath
    if ($utilsContent -match 'export (?:interface|type|enum)\s') {
      Warn "G3-UTILS-TYPE" $modName "" "utils.ts contains type definitions, recommend extracting to types.ts"
    }
    if ($utilsContent -match 'export const [A-Z_]+\s*=') {
      Warn "G3-UTILS-CONST" $modName "" "utils.ts contains constant definitions, recommend extracting to constants.ts"
    }
    if ($utilsContent -match 'use[A-Z]\w+\s*\(') {
      Fail "G3-UTILS-HOOK" $modName "" "utils.ts contains React Hook, utility files should not contain Hooks"
    }
  }

  # G4: subsystems/ purity check
  $subDir = Join-Path $modPath "subsystems"
  if (Test-Path $subDir) {
    $subFiles = @(Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
    foreach ($sf in $subFiles) {
      $sc = Get-FileContent $sf.FullName
      $relPath = "src/mods/${modName}/subsystems/$($sf.Name)"
      if ($sc -match 'export (?:interface|type|enum)\s') {
        Warn "G4-SUB-TYPE" $relPath "" "subsystem contains type definitions, recommend extracting to types.ts"
      }
      if ($sc -match 'export const [A-Z_]+\s*=') {
        Warn "G4-SUB-CONST" $relPath "" "subsystem contains constant definitions, recommend extracting to constants.ts"
      }
      if ($sc -match '(?:const|let|var)\s+\w+\s*=\s*/.+/' -and $modName -eq 'mod-engine') {
        Warn "G4-SUB-REGEX" $relPath "" "subsystem contains hardcoded regex, recommend extracting to patterns/ directory"
      }
    }
  }

  # G8: index.ts export check
  $idxPath = Join-Path $modPath "index.ts"
  if (Test-Path $idxPath) {
    $idxContent = Get-FileContent $idxPath
    if ($idxContent -match 'export\s+\*') {
      Fail "H1-INDEX-EXPORT-ALL" $modName "" "index.ts uses export *, must use named exports"
    }
    $nonExportLines = @()
    foreach ($line in ($idxContent -split "`n")) {
      $trimmed = $line.Trim()
      if ($trimmed -eq '' -or $trimmed -match '^\s*//' -or $trimmed -match '^\s*\*' -or $trimmed -match '^\s*export' -or $trimmed -match '^\s*import') { continue }
      $nonExportLines += $trimmed
    }
    if ($nonExportLines.Count -gt 5) {
      Warn "H1-INDEX-LOGIC" $modName "" "index.ts contains $($nonExportLines.Count) lines of non-export code, should only have named exports"
    }
  }

  # G6: store.ts purity check
  $storePath = Join-Path $modPath "store.ts"
  if (Test-Path $storePath) {
    $storeContent = Get-FileContent $storePath
    if ($storeContent -match 'export (?:interface|type|enum)\s') {
      Warn "G6-STORE-TYPE" $modName "" "store.ts contains type definitions, recommend extracting to types.ts"
    }
  }

  # G7: hooks.ts purity check
  $hooksPath = Join-Path $modPath "hooks.ts"
  if (Test-Path $hooksPath) {
    $hooksContent = Get-FileContent $hooksPath
    if ($hooksContent -match 'export (?:interface|type|enum)\s') {
      Warn "G7-HOOKS-TYPE" $modName "" "hooks.ts contains type definitions, recommend extracting to types.ts"
    }
    if ($hooksContent -match 'export const [A-Z_]+\s*=') {
      Warn "G7-HOOKS-CONST" $modName "" "hooks.ts contains constant definitions, recommend extracting to constants.ts"
    }
  }
}

# ============================================================
# Post-pass 3: Dependency Direction Check (D24)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 3: D24 Dependency Direction Check ---" -ForegroundColor Cyan

$loSegments = @(
  @{Name="Engine"; AllowedDeps=@() },
  @{Name="Data"; AllowedDeps=@("Engine") },
  @{Name="World"; AllowedDeps=@("Engine","Data") },
  @{Name="Social"; AllowedDeps=@("Engine","Data","World") },
  @{Name="UI"; AllowedDeps=@("Engine","Data","World","Social") },
  @{Name="Page"; AllowedDeps=@("Engine","Data","World","Social","UI") }
)

foreach ($mn in $AllManifests.Keys) {
  $info = $AllManifests[$mn]
  $myTier = Get-ModTier $mn
  if (-not $myTier) { continue }
  $mySegment = $loSegments | Where-Object { $_.Name -eq $myTier } | Select-Object -First 1
  if (-not $mySegment) { continue }

  foreach ($dep in $info.dependencies) {
    $depName = Resolve-ModDependencyName $dep
    if (-not $AllManifests.ContainsKey($depName)) { continue }
    $depTier = Get-ModTier $depName
    if (-not $depTier) { continue }
    $depSegment = $loSegments | Where-Object { $_.Name -eq $depTier } | Select-Object -First 1
    if (-not $depSegment) { continue }

    if ($mySegment.Name -eq "Engine" -and $depSegment.Name -ne "Engine") {
      Warn "D24-SEGMENT-REVERSE" $mn "" "legacy tier model flags dependency on $($depSegment.Name)-level MOD '$depName'; verify against the active public contract"
    }
    if ($depSegment.Name -notin $mySegment.AllowedDeps -and $depSegment.Name -ne $mySegment.Name) {
      Warn "D24-SEGMENT-REVERSE" $mn "" "legacy tier model flags '$mn' -> '$depName'; current authority only enforces app -> mods -> core -> foundation and public MOD boundaries"
    }
  }
}

# ============================================================
