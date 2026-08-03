# Purpose: Validate MOD prompt, route, API, event, import, call-chain, and default-import contracts.
# Owner: quality:mod
# Responsibility: D11-D17 smart-scanner rules only.

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
