# Purpose: Validate public exports, MOD dependency cycles, and internal dead exports.
# Owner: quality:mod
# Responsibility: D22-D24 smart-scanner rules only.

# === D22: Unused export detection ===
Write-Host "  [D22] Checking unused exports..." -ForegroundColor DarkGray
# Build: for each MOD, collect all exports from index.ts
$modExports = @{}
foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  $ip = Join-Path $info.Path "index.ts"
  if (-not (Test-Path $ip)) { continue }
  $ic = Get-FileContent $ip
  if (-not $ic) { continue }
  
  $exports = @()
  # Named exports: export { A, B } - filter comments and whitespace
  $namedMatches = [regex]::Matches($ic, 'export\s+\{\s*([^}]+)\s*\}')
  foreach ($nm in $namedMatches) {
    $block = $nm.Groups[1].Value
    # Split by comma, filter out comments and whitespace-only entries
    $entries = $block -split ',' | ForEach-Object { $_ -replace '//.*$', '' } | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -match '^[A-Za-z_]\w*$' }
    foreach ($entry in $entries) { $exports += $entry }
  }
  # Direct exports: export function/const/class/type/interface/enum Name (ASCII identifiers only)
  $directMatches = [regex]::Matches($ic, 'export\s+(?:function|const|class|type|interface|enum)\s+([A-Za-z_]\w*)')
  foreach ($dm in $directMatches) { $exports += $dm.Groups[1].Value }
  
  $modExports[$mn] = $exports
}

# For each MOD, check which exports are actually imported by other files
$allImportContent = ""
foreach ($f in $allTsFiles2) {
  $fc = Get-FileContent $f.FullName
  if ($fc) { $allImportContent += $fc }
}

foreach ($mn in $modExports.Keys) {
  $exp = $modExports[$mn]
  foreach ($exportName in $exp) {
    if ($exportName -match '^(type|interface|loadOrder|name|version|description)\b') { continue }
    # Check if this export is imported from this MOD by any file (excluding self-imports)
    $importPattern = "from\s+'@/mods/" + [regex]::Escape($mn) + "'"
    $importBlocks = [regex]::Matches($allImportContent, "import\s+\{([^}]*)\}\s+" + $importPattern)
    $isUsed = $false
    foreach ($ib in $importBlocks) {
      if ($ib.Groups[1].Value -match "(?<!\w)$([regex]::Escape($exportName))(?!\w)") {
        $isUsed = $true
        break
      }
    }
    if (-not $isUsed) {
      # Also check if exported via export * from (re-exports)
      $reExportPattern = 'export\s+\{[^}]*\b' + [regex]::Escape($exportName) + '\b[^}]*\}\s+from\s+'
      if ($allImportContent -notmatch $reExportPattern) {
        if ($VerboseOutput) {
          Warn "D22-UNUSED-EXPORT" "src/mods/${mn}/index.ts" "" "Export '$exportName' from '$mn' may be unused (no external imports found)"
        }
      }
    }
  }
}

# === D23: Circular dependency detection ===
Write-Host "  [D23] Checking circular dependencies..." -ForegroundColor DarkGray
# Build dependency graph: MOD A depends on MOD B if A imports from @/mods/B
$modGraph = @{}
foreach ($mn in $AllModInfo.Keys) { $modGraph[$mn] = @() }
foreach ($f in $allTsFiles2) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $ownMod = ""
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")
  if ($relFP -match '^src/mods/(mod-[a-z0-9-]+)/') { $ownMod = $Matches[1] }
  if (-not $ownMod) { continue }
  
  $imports = [regex]::Matches($fc, "from\s+'@/mods/(mod-[a-z0-9-]+)'")
  foreach ($im in $imports) {
    $targetMod = $im.Groups[1].Value
    if ($targetMod -ne $ownMod -and $modGraph.ContainsKey($ownMod) -and $targetMod -notin $modGraph[$ownMod]) {
      $modGraph[$ownMod] += $targetMod
    }
  }
}

# DFS cycle detection
$visited = @{}
$recStack = @{}
$cycles = @()

function Find-Cycles($node, $path) {
  $visited[$node] = $true
  $recStack[$node] = $true
  foreach ($neighbor in $modGraph[$node]) {
    if (-not $visited[$neighbor]) {
      Find-Cycles $neighbor ($path + @($node))
    } elseif ($recStack[$neighbor]) {
      $cycleStart = $path.IndexOf($neighbor)
      if ($cycleStart -ge 0) {
        $cyclePath = $path[$cycleStart..($path.Count - 1)] + @($node, $neighbor)
        $cycleKey = ($cyclePath -join ' -> ')
        if ($cycleKey -notin $cycles) { $cycles += $cycleKey }
      }
    }
  }
  $recStack[$node] = $false
}

foreach ($mn in $modGraph.Keys) { $visited[$mn] = $false; $recStack[$mn] = $false }
foreach ($mn in $modGraph.Keys) {
  if (-not $visited[$mn]) { Find-Cycles $mn @() }
}

foreach ($cycle in $cycles) {
  Fail "D23-CIRCULAR-DEPS" "src/mods/" "" "Circular dependency detected: $cycle"
}
if ($cycles.Count -eq 0) {
  Write-Host "  [OK]   No circular dependencies found" -ForegroundColor Green
}

# === D24: MOD internal dead export detection ===
Write-Host "  [D24] Checking MOD-internal dead exports..." -ForegroundColor DarkGray

# Build reverse dependency map: which MODs depend on each MOD
$reverseDeps = @{}
foreach ($mdn in $AllModInfo.Keys) {
  $reverseDeps[$mdn] = @()
}
foreach ($mdn in $AllModInfo.Keys) {
  $md = $AllModInfo[$mdn]
  $m = [regex]::Match($md.ManContent, "dependencies:\s*\[([^\]]*)\]")
  if ($m.Success) {
    $rawDeps = $m.Groups[1].Value -replace "[\s']", ""
    if ($rawDeps) {
      foreach ($dep in ($rawDeps -split "," | Where-Object { $_ })) {
        if ($reverseDeps.ContainsKey($dep)) {
          $reverseDeps[$dep] += $mdn
        }
      }
    }
  }
}
# mod-pages is always a consumer (pages import from all MODs)
$pagesConsumer = ($AllModInfo.ContainsKey("mod-pages"))

# Preload all source files for cross-MOD search
if (-not $AllSrcFiles) {
  $AllSrcFiles = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' })
}
$allGlobalContent = ""
foreach ($gf in $AllSrcFiles) {
  $gfc = Get-FileContent $gf.FullName
  if ($gfc) { $allGlobalContent += $gfc + "`n" }
}

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  $modFiles = @(Get-ChildItem -Path $info.Path -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { 
    $_.Name -notmatch '^index\.' -and $_.FullName -notmatch '[\\/]_internal[\\/]' -and $_.Name -notmatch '\.types\.' 
  })
  
  # Build cross-MOD content: content from MODs that depend on this MOD
  $crossModContent = ""
  $dependents = @($reverseDeps[$mn])
  # Always include mod-pages as consumer for UI/data MODs
  if ($pagesConsumer -and $mn -ne "mod-pages") {
    if ($AllModInfo.ContainsKey("mod-pages")) {
      $dependents += "mod-pages"
    }
  }
  $dependents = $dependents | Select-Object -Unique
  foreach ($depMod in $dependents) {
    if ($AllModInfo.ContainsKey($depMod)) {
      $depFiles = @(Get-ChildItem -Path $AllModInfo[$depMod].Path -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' })
      foreach ($df in $depFiles) {
        $dfc = Get-FileContent $df.FullName
        if ($dfc) { $crossModContent += $dfc + "`n" }
      }
    }
  }

  foreach ($mf in $modFiles) {
    $fc = Get-FileContent $mf.FullName
    if (-not $fc) { continue }
    $relFP = $mf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")
    # Find exports (non-default, non-types-only)
    $exportMatches = [regex]::Matches($fc, 'export\s+(?:const|function|class|let|var)\s+([A-Za-z_]\w*)')
    if ($exportMatches.Count -eq 0) { continue }
    # Collect all other files in this MOD for cross-reference
    $modContent = ""
    foreach ($omf in $modFiles) {
      if ($omf.FullName -ne $mf.FullName) {
        $omfc = Get-FileContent $omf.FullName
        if ($omfc) { $modContent += $omfc + "`n" }
      }
    }
    foreach ($em in $exportMatches) {
      $exportName = $em.Groups[1].Value
      if ($exportName -match '^(loadOrder|name|version|description|dependencies|provides|consumes|subsystems|routes|stores|events|prompts)$') { continue }
      # Check if used in same MOD OR in dependent MODs OR globally
      $usedInMod = ($modContent -match "(?<!\w)$([regex]::Escape($exportName))(?!\w)")
      $usedInCross = ($crossModContent -match "(?<!\w)$([regex]::Escape($exportName))(?!\w)")
      if (-not $usedInMod -and -not $usedInCross) {
        Warn "D24-DEAD-EXPORT" $relFP "" "Export '$exportName' not referenced in any other file within the same MOD or dependent MODs"
      }
    }
  }
}
