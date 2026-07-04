# smart-scanner.ps1

$checkDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. ([System.IO.Path]::Combine($checkDir, "lib", "checker-utils.ps1"))

Write-Host ""
Write-Host "=== Smart Scanner ===" -ForegroundColor Cyan

$smartStartErrors = $E.Errors
$smartStartWarnings = $E.Warnings

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

  $m = [regex]::Match($mc, "subsystems:\s*\[([^\]]*)\]")
  if ($m.Success) {
    $raw = $m.Groups[1].Value -replace "[\s']", ""
    $info.Subsystems = if ($raw) { $raw -split "," | Where-Object { $_ } } else { @() }
  } else { $info.Subsystems = @() }

  $m = [regex]::Match($mc, "stores:\s*\[([^\]]*)\]")
  if ($m.Success) {
    $raw = $m.Groups[1].Value -replace "[\s']", ""
    $info.Stores = if ($raw) { $raw -split "," | Where-Object { $_ } } else { @() }
  } else { $info.Stores = @() }

  $m = [regex]::Match($mc, "dependencies:\s*\[([^\]]*)\]")
  if ($m.Success) {
    $raw = $m.Groups[1].Value -replace "[\s']", ""
    $info.Deps = if ($raw) { $raw -split "," | Where-Object { $_ } } else { @() }
  } else { $info.Deps = @() }

  $m = [regex]::Match($mc, "provides:\s*\[([^\]]*)\]")
  if ($m.Success) {
    $raw = $m.Groups[1].Value -replace "[\s']", ""
    $info.Provides = if ($raw) { $raw -split "," | Where-Object { $_ } } else { @() }
  } else { $info.Provides = @() }

  $m = [regex]::Match($mc, "consumes:\s*\[([^\]]*)\]")
  if ($m.Success) {
    $raw = $m.Groups[1].Value -replace "[\s']", ""
    $info.Consumes = if ($raw) { $raw -split "," | Where-Object { $_ } } else { @() }
  } else { $info.Consumes = @() }

  $info.Emits = @()
  $info.Listens = @()
  $evtBlockMatch = [regex]::Match($mc, "events:\s*\{([\s\S]+?)\}")
  if ($evtBlockMatch.Success) {
    $evtBlock = $evtBlockMatch.Groups[1].Value
    $emitMatch = [regex]::Match($evtBlock, "emits:\s*\[([^\]]*)\]")
    if ($emitMatch.Success) {
      $raw = $emitMatch.Groups[1].Value -replace "[\s']", ""
      $info.Emits = if ($raw) { $raw -split "," | Where-Object { $_ } } else { @() }
    }
    $listenMatch = [regex]::Match($evtBlock, "listens:\s*\[([^\]]*)\]")
    if ($listenMatch.Success) {
      $raw = $listenMatch.Groups[1].Value -replace "[\s']", ""
      $info.Listens = if ($raw) { $raw -split "," | Where-Object { $_ } } else { @() }
    }
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

function Resolve-ModDependencyName($dep) {
  $d = $dep.Trim()
  if ($d.StartsWith('~') -or $d.StartsWith('?') -or $d.StartsWith('!')) {
    return $d.Substring(1).Trim()
  }
  return $d
}

Write-Host "  Pre-pass: collected $($AllModInfo.Count) MOD manifests"

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
    Fail "D7-SUBSINDEX" $mn "" "subsystems/ exists but missing index.ts"
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
        Warn "D9-CONSUME-DEP" $mn "" "consumes '$cap' from '$provider' but no dependency on provider — add '~ $provider' or hard dependency"
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
      if (-not $inSubsystem -and -not $inNamespace -and -not $inIndex) {
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

# === D11: Prompt registration chain ===
Write-Host "  [D11] Checking prompt chain..." -ForegroundColor DarkGray

function Test-PromptFileExists($declaredName, $actualNames) {
  if ($actualNames.ContainsKey($declaredName)) { return $true }
  if ($actualNames.ContainsKey("${declaredName}-prompt")) { return $true }
  if ($declaredName -match '-prompt$') {
    $short = $declaredName -replace '-prompt$', ''
    if ($actualNames.ContainsKey($short)) { return $true }
  }
  return $false
}

function Test-PromptDeclaredInManifest($fileBase, $declaredPrompts) {
  if ($fileBase -in $declaredPrompts) { return $true }
  if ("${fileBase}-prompt" -in $declaredPrompts) { return $true }
  if ($fileBase -match '-prompt$') {
    $short = $fileBase -replace '-prompt$', ''
    if ($short -in $declaredPrompts) { return $true }
  }
  return $false
}

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  $promptsMatch = [regex]::Match($info.ManContent, "prompts:\s*\[([^\]]*)\]")
  if (-not $promptsMatch.Success) { continue }
  $raw = $promptsMatch.Groups[1].Value -replace "[\s']", ""
  $declaredPrompts = if ($raw) { $raw -split "," | Where-Object { $_ } } else { @() }
  if ($declaredPrompts.Count -eq 0) { continue }

  $promptsDir = Join-Path $info.Path "prompts"
  if (-not (Test-Path $promptsDir)) {
    Fail "D11-PROMPT-DIR" $mn "" "manifest declares prompts but prompts/ dir missing"
    continue
  }
  $actualFiles = @(Get-ChildItem -Path $promptsDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
  $actualNames = @{}
  foreach ($pf in $actualFiles) {
    $base = $pf.Name -replace "\.ts$", ""
    $actualNames[$base] = $pf.Name
  }

  foreach ($dp in $declaredPrompts) {
    if (-not (Test-PromptFileExists $dp $actualNames)) {
      Fail "D11-PROMPT-MISSING" $mn "" "manifest declares prompt '$dp' but file not found in prompts/ (supports name or name-prompt.ts)"
    }
  }
  foreach ($an in $actualNames.Keys) {
    if (-not (Test-PromptDeclaredInManifest $an $declaredPrompts)) {
      Warn "D11-PROMPT-EXTRA" $mn "" "prompts/$($actualNames[$an]) exists but not registered in manifest"
    }
  }
}

# === D12: Route path resolution ===
Write-Host "  [D12] Checking route paths..." -ForegroundColor DarkGray

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  if ($info.ManContent -notmatch 'routes:\s*\[') { continue }

  $routePattern = "\{\s*path:\s*'([^']+)'\s*,\s*page:\s*'([^']+)'[^}]*\}"
  $routeMatches = [regex]::Matches($info.ManContent, $routePattern)
  foreach ($rm in $routeMatches) {
    $routePath = $rm.Groups[1].Value
    $pageRef = $rm.Groups[2].Value
    $expectedFile1 = [System.IO.Path]::Combine($info.Path, "pages", $pageRef, "page.tsx")
    $expectedFile2 = [System.IO.Path]::Combine($info.Path, "pages", $pageRef, "page.ts")
    if (-not (Test-Path $expectedFile1) -and -not (Test-Path $expectedFile2)) {
      Fail "D12-ROUTE-PAGE" $mn "" "route '$routePath' page '$pageRef' not found: expected pages/$pageRef/page.tsx"
    }
  }
}

# === D13: API delegation chain ===
Write-Host "  [D13] Checking API chain..." -ForegroundColor DarkGray

$appApiDir = Join-Path $SrcDir "app/api"
if (Test-Path $appApiDir) {
  $appRoutes = @(Get-ChildItem -Path $appApiDir -Directory -ErrorAction SilentlyContinue)
  foreach ($ar in $appRoutes) {
    $routeFile = Join-Path $ar.FullName "route.ts"
    if (-not (Test-Path $routeFile)) { continue }
    $rc = Get-FileContent $routeFile
    $delegateMatch = [regex]::Match($rc, "from\s+'@/mods/(mod-[a-z0-9-]+)/api/([^']+)'")
    if ($delegateMatch.Success) {
      $targetMod = $delegateMatch.Groups[1].Value
      $targetFile = $delegateMatch.Groups[2].Value
      $modApiPath = [System.IO.Path]::Combine($SrcDir, "mods", $targetMod, "api", $targetFile)
      if (-not (Test-Path $modApiPath)) {
        Fail "D13-API-DELEGATE" $ar.Name "" "API delegate points to @/mods/$targetMod/api/$targetFile but file not found"
      }
    }
  }
}

# === D14: emit()/on() event name vs manifest ===
Write-Host "  [D14] Checking emit/listen consistency..." -ForegroundColor DarkGray

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  $modTsFiles = @(Get-ChildItem -Path $info.Path -Recurse -Filter "*.ts" -File -ErrorAction SilentlyContinue)
  $codeEmits = @{}
  $codeListens = @{}
  # Single traversal: collect both emit and listen calls
  foreach ($tf in $modTsFiles) {
    $tc = Get-FileContent $tf.FullName
    if (-not $tc) { continue }
    $emitCalls = [regex]::Matches($tc, "\.emit\('([^']+)'")
    foreach ($ec in $emitCalls) {
      $evtName = $ec.Groups[1].Value
      if ($evtName -notmatch '^mod-') { continue }
      $codeEmits[$evtName] = $tf.Name
    }
    if ($info.Listens.Count -gt 0) {
      $listenCalls = [regex]::Matches($tc, "\.on\('([^']+)'")
      foreach ($lc in $listenCalls) {
        $evtName2 = $lc.Groups[1].Value
        if ($evtName2 -notmatch '^mod-') { continue }
        $codeListens[$evtName2] = $tf.Name
      }
    }
  }
  foreach ($ce in $codeEmits.Keys) {
    if ($ce -notin $info.Emits) {
      Fail "D14-EMIT-UNDECLARED" $mn "" "code emits '$ce' (in $($codeEmits[$ce])) but not declared in manifest.emits"
    }
  }
  foreach ($de in $info.Emits) {
    if (-not $codeEmits.ContainsKey($de)) {
      Warn "D14-EMIT-UNUSED" $mn "" "manifest.emits declares '$de' but no code actually emits it"
    }
  }
  # listens 未使用：子系统 MOD 经 orchestrator.advance 推进，非 eventBus.on() —— 蓝图 Phase 2.3 设计如此，跳过 WARN
}

# === D15: Import name vs export name matching ===
Write-Host "  [D15] Checking import/export match..." -ForegroundColor DarkGray

$modExportsCache = @{}
foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  $ip = Join-Path $info.Path "index.ts"
  if (-not (Test-Path $ip)) { continue }
  $ic = Get-FileContent $ip
  $exportNames = @{}
  # Match: export const/function/class/type/interface/enum Name
  $declExports = [regex]::Matches($ic, 'export\s+(?:const|function|class|type|interface|enum)\s+(\w+)')
  foreach ($de in $declExports) {
    $exportNames[$de.Groups[1].Value] = $true
  }
  # Match: export { a, b, c } or export { a as b }
  $namedExportMatches = [regex]::Matches($ic, 'export\s+\{\s*([^}]+)\s*\}')
  foreach ($nem in $namedExportMatches) {
    $rawNames = ($nem.Groups[1].Value -replace '\s+as\s+\w+', '') -split ','
     foreach ($n in $rawNames) {
       $clean = $n.Trim()
      if ($clean) { $exportNames[$clean] = $true }
    }
  }
  $modExportsCache[$mn] = $exportNames
}

$allTsFiles2 = $AllSrcFiles  # reuse from orchestrator
foreach ($f in $allTsFiles2) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")
  $namedImports = [regex]::Matches($fc, "import\s+\{([^}]+)\}\s+from\s+'@/mods/(mod-[a-z0-9-]+)'")
  foreach ($ni in $namedImports) {
    $importedNames = $ni.Groups[1].Value -split ","
    $targetMod = $ni.Groups[2].Value
    if (-not $modExportsCache.ContainsKey($targetMod)) { continue }
    foreach ($iname in $importedNames) {
      $cleanName = ($iname.Trim() -replace '\s+as\s+\w+', "" -replace '\s+type\s+', "").Trim()
      if (-not $cleanName -or $cleanName -eq "type") { continue }
      if (-not $modExportsCache[$targetMod].ContainsKey($cleanName)) {
        Warn "D15-IMPORT-MISMATCH" $relFP "" "'$cleanName' imported from '$targetMod' but not found in its index.ts exports"
      }
    }
  }
}

# === D16: Function call chain     imported functions actually called ===
Write-Host "  [D16] Checking function call chains..." -ForegroundColor DarkGray

$modExportFuncs = @{}
foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  $ip = Join-Path $info.Path "index.ts"
  if (-not (Test-Path $ip)) { continue }
  $ic = Get-FileContent $ip
  if (-not $ic) { continue }

  # Extract all exported function/class/hook/store names
  $funcNames = @()
  $funcMatches = [regex]::Matches($ic, 'export\s+(?:function|const)\s+(\w+)')
  foreach ($fm in $funcMatches) { $funcNames += $fm.Groups[1].Value }
  $namedExportMatches = [regex]::Matches($ic, 'export\s+\{\s*([^}]+)\s*\}')
  foreach ($nem in $namedExportMatches) {
    $rawNames = ($nem.Groups[1].Value -replace '\s+as\s+\w+', '') -split ','
    foreach ($n in $rawNames) {
      $clean = $n.Trim()
      if ($clean) { $funcNames += $clean }
    }
  }
  $modExportFuncs[$mn] = $funcNames
}

# Check if imported functions are actually used (called) in the target file
foreach ($f in $allTsFiles2) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  $namedImports = [regex]::Matches($fc, "import\s+\{([^}]+)\}\s+from\s+'@/mods/(mod-[a-z0-9-]+)'")
  foreach ($ni in $namedImports) {
    $importedNames = $ni.Groups[1].Value -split ","
    $targetMod = $ni.Groups[2].Value
    if (-not $modExportFuncs.ContainsKey($targetMod)) { continue }

    foreach ($iname in $importedNames) {
      $cleanName = ($iname.Trim() -replace '\s+as\s+\w+', "" -replace '\s+type\s+', "").Trim()
      if (-not $cleanName -or $cleanName -eq "type") { continue }

      # Skip UPPER_SNAKE_CASE constants - they are values, not callables
      if ($cleanName -cmatch '^[A-Z][A-Z0-9_]+$') {
        # Check if constant is used anywhere in the file (not just as function call)
        $importLine = $ni.Groups[0].Value
        $restOfFileC = $fc -replace [regex]::Escape($importLine), ''
        $restOfFileC = $restOfFileC -replace "import\s+\{[^}]*\}\s+from\s+'[^']+'", ''
        $restOfFileC = $restOfFileC -replace "import\s+type\s+\{[^}]*\}\s+from\s+'[^']+'", ''
        if ($restOfFileC -notmatch [regex]::Escape($cleanName)) {
          Warn "D16-CONST-UNUSED" $relFP "" "constant '$cleanName' imported from '$targetMod' but never referenced"
        }
        continue
      }

      # Check if the imported name appears as a function call in the file body (after the import section)
      $usagePattern = [regex]::Escape($cleanName) + '\s*[\(<:]'
      # Remove only the specific import line and check remaining content
      $importLine = $ni.Groups[0].Value
      $restOfFile = $fc -replace [regex]::Escape($importLine), ''
      # Also strip all import lines to avoid matching type-only imports
      $restOfFile = $restOfFile -replace "import\s+\{[^}]*\}\s+from\s+'[^']+'", ''
      $restOfFile = $restOfFile -replace "import\s+type\s+\{[^}]*\}\s+from\s+'[^']+'", ''
      if ($restOfFile -match $usagePattern) {
        # Function is used - good
      } else {
        Warn "D16-FUNCTION-UNUSED" $relFP "" "'$cleanName' imported from '$targetMod' but may not be used in file"
      }
    }
  }
}

# === D17: Default import check ===
Write-Host "  [D17] Checking default imports from MODs..." -ForegroundColor DarkGray

foreach ($f in $allTsFiles2) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  $defaultImports = [regex]::Matches($fc, "import\s+(\w+)\s+from\s+'@/mods/(mod-[a-z0-9-]+)'")
  foreach ($di in $defaultImports) {
    $impName = $di.Groups[1].Value
    $targetMod = $di.Groups[2].Value
    $ownMod = ""
    if ($relFP -match '^src/mods/(mod-[a-z0-9-]+)/') { $ownMod = $Matches[1] }
    if ($targetMod -eq $ownMod) { continue }
    if ($f.Name -ne "manifest.ts" -and $relFP -notmatch 'manifest\.ts$') {
      Warn "D17-DEFAULT-IMPORT" $relFP "" "Uses default import '$impName' from '$targetMod', recommend using named import"
    }
  }
}

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

# === D33: Dependency prefix validation (~/?/!)
Write-Host "  [D33] Checking dependency prefix conventions..." -ForegroundColor DarkGray

$d33StartErrors = $E.Errors
$d33StartWarnings = $E.Warnings

# Build list of all MOD names (including those in modsDir, not just registered)
$allModNamesA33 = @{}
foreach ($md in $modDirs) { $allModNamesA33[$md.Name] = $true }

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  if ($info.Deps.Count -eq 0) { continue }

  foreach ($dep in $info.Deps) {
    $trimmed = $dep.Trim()
    if ($trimmed.StartsWith('~') -or $trimmed.StartsWith('?') -or $trimmed.StartsWith('!')) {
      $baseName = Resolve-ModDependencyName $dep

      if (-not $allModNamesA33.ContainsKey($baseName)) {
        Fail "D33-DEP-PREFIX" $mn "" "Dependency '$dep' uses prefix but base MOD '$baseName' does not exist in src/mods/"
      }

      if ($trimmed.StartsWith('!')) {
        $resolvedDeps = @($info.Deps | ForEach-Object { Resolve-ModDependencyName $_ })
        if ($resolvedDeps -contains $baseName -and ($info.Deps -contains $baseName)) {
          Warn "D33-DEP-PREFIX" $mn "" "Dependency '$baseName' listed as both incompatible ('!') and normal — inconsistent dependency declaration"
        }
      }
    }
  }
}

$d33Errors = $E.Errors - $d33StartErrors
$d33Warnings = $E.Warnings - $d33StartWarnings

# Stats
$smartErrors = $E.Errors - $smartStartErrors
$smartWarnings = $E.Warnings - $smartStartWarnings
$color = if ($smartErrors -gt 0) { "Red" } else { "Green" }
Write-Host "  Smart scan done: $smartErrors errors, $smartWarnings warnings" -ForegroundColor $color
