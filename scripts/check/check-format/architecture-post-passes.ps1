# Purpose: Run cross-file architecture post-passes after the selected scanners.
# Owner: quality:infrastructure
# Responsibility: C18-C19, D25-D32, and F4 post-scan checks only.

if ($RunModPostScan) {
# -------------------------------------------------------
# 2.8 Architecture Post-passes (C18-C19, D25-D29, F4)
# -------------------------------------------------------
Write-Host ""
Write-Host "========================================================"
Write-Host "  Architecture Post-passes"
Write-Host "========================================================" -ForegroundColor Cyan

# === C18: Theme ID whitelist ===
Write-Host "  [C18] Checking theme IDs..." -ForegroundColor DarkGray
$c18StartErrors = $E.Errors
$c18StartWarnings = $E.Warnings
$validThemes = @('default','dark','cultivation','wuxia','scifi','apocalypse')
$forbiddenThemes = @('xianxia','cyberpunk','medieval','fantasy','modern','steampunk')
$allModFiles186 = $AllSrcFiles
foreach ($f in $allModFiles186) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  foreach ($ft in $forbiddenThemes) {
  if (($fc -match "\btheme\b.*\b${ft}\b") -or ($fc -match "\b${ft}\b.*\btheme\b")) {
      $rel = $f.FullName.Substring($SrcDir.Length + 1).Replace('\','/')
      Warn "C18-THEME-ID" $rel "" "Contains forbidden legacy theme ID '$ft'. Use one of: $($validThemes -join ', ')"
    }
  }
}
$c18Errors = $E.Errors - $c18StartErrors
$c18Warnings = $E.Warnings - $c18StartWarnings
Write-Host "  C18-THEME-ID   : $c18Errors errors, $c18Warnings warnings" -ForegroundColor $(if ($c18Errors -gt 0) { "Red" } elseif ($c18Warnings -gt 0) { "Yellow" } else { "Green" })

# === C19: data-theme attribute ===
Write-Host "  [C19] Checking data-theme attribute..." -ForegroundColor DarkGray
$c19StartErrors = $E.Errors
$c19StartWarnings = $E.Warnings
$themeDir = Join-Path $SrcDir "core\theme"
if (Test-Path $themeDir) {
  $themeFiles = @(Get-ChildItem -Path $themeDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue)
  foreach ($tf in $themeFiles) {
    $tc = Get-FileContent $tf.FullName
    if (-not $tc) { continue }
    if (($tc -match 'setAttribute|classList\.add.*theme|className.*theme') -and $tc -notmatch 'data-theme') {
      $rel = "src/core/theme/$($tf.Name)"
      Warn "C19-THEME-ATTR" $rel "" "Theme switching should use data-theme attribute, not className-based themes"
    }
  }
}
$c19Errors = $E.Errors - $c19StartErrors
$c19Warnings = $E.Warnings - $c19StartWarnings
Write-Host "  C19-THEME-ATTR : $c19Errors errors, $c19Warnings warnings" -ForegroundColor $(if ($c19Errors -gt 0) { "Red" } elseif ($c19Warnings -gt 0) { "Yellow" } else { "Green" })

# === D25-D27: Pattern system validation ===
Write-Host "  [D25-D27] Checking pattern system..." -ForegroundColor DarkGray
$d2527StartErrors = $E.Errors
$d2527StartWarnings = $E.Warnings
$validCategories = @('relationship','importance','closure','forgetting','direction')
foreach ($md in $modDirs) {
  $mn = $md.Name
  $patternsDir = Join-Path $md.FullName "patterns"
  if (-not (Test-Path $patternsDir)) { continue }
  $patternFiles = @(Get-ChildItem -Path $patternsDir -Filter "*-patterns.ts" -File -ErrorAction SilentlyContinue)
  foreach ($pf in $patternFiles) {
    $pc = Get-FileContent $pf.FullName
    if (-not $pc) { continue }
    $pfRel = "src/mods/${mn}/patterns/$($pf.Name)"
    if ($pc -match 'export\s+class\s+\w+Pattern\b') {
      # Allow all classes in the BasePattern hierarchy: BasePattern, KeywordPattern (extends BasePattern),
      # CompoundPattern (extends BasePattern), or any intermediate abstract subclass
      if ($pc -notmatch 'extends\s+(BasePattern|KeywordPattern|CompoundPattern)\b') {
        Fail "D25-PATTERN-CLASS" $pfRel "" "Pattern class must extend BasePattern, KeywordPattern, or CompoundPattern"
      }
    }
    $idMatches = [regex]::Matches($pc, "(?:id|patternId)\s*[=:]\s*['`"]([^'`"]+)['`"]")
    foreach ($im in $idMatches) {
      $pid = $im.Groups[1].Value
      if ($pid -notmatch '^[a-z]+\.[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$') {
        Fail "D26-PATTERN-ID" $pfRel "" "Pattern ID '$pid' should be '{category}.{name}' format"
      }
      $cat = $pid.Split('.')[0]
      if ($cat -notin $validCategories) {
        Fail "D27-PATTERN-CATEGORY" $pfRel "" "Pattern category '$cat' not in whitelist: $($validCategories -join ', ')"
      }
    }
  }
}
$d2527Errors = $E.Errors - $d2527StartErrors
$d2527Warnings = $E.Warnings - $d2527StartWarnings
Write-Host "  D25-D27         : $d2527Errors errors, $d2527Warnings warnings" -ForegroundColor $(if ($d2527Errors -gt 0) { "Red" } elseif ($d2527Warnings -gt 0) { "Yellow" } else { "Green" })

# === D28: PatternFactory registration ===
Write-Host "  [D28] Checking PatternFactory registration..." -ForegroundColor DarkGray
$d28StartErrors = $E.Errors
$d28StartWarnings = $E.Warnings
foreach ($md in $modDirs) {
  $mn = $md.Name
  $patternsDir = Join-Path $md.FullName "patterns"
  if (-not (Test-Path $patternsDir)) { continue }
  $factoryFile = Join-Path $patternsDir "pattern-factory.ts"
  if (-not (Test-Path $factoryFile)) { continue }
  $fc = Get-FileContent $factoryFile
  if (-not $fc) { continue }
  $pFiles = @(Get-ChildItem -Path $patternsDir -Filter "*-patterns.ts" -File -ErrorAction SilentlyContinue)
  foreach ($pf in $pFiles) {
    $pc = Get-FileContent $pf.FullName
    if (-not $pc) { continue }

    # Collect exported array names from this pattern file (e.g. CLOSURE_PATTERNS, IMPORTANCE_PATTERNS)
    $exportedArrays = @()
    $arrayMatches = [regex]::Matches($pc, 'export\s+const\s+([A-Z][A-Z0-9_]+)\s*=\s*\[')
    foreach ($am in $arrayMatches) {
      $exportedArrays += $am.Groups[1].Value
    }
    # Also match: export const XXX = [...]
    $arrayMatches2 = [regex]::Matches($pc, 'export\s+const\s+([A-Z][A-Z0-9_]+)\s*:\s*\w+\[\]\s*=\s*\[')
    foreach ($am in $arrayMatches2) {
      if ($am.Groups[1].Value -notin $exportedArrays) {
        $exportedArrays += $am.Groups[1].Value
      }
    }

    # Check if any exported array from this file is referenced in the factory
    $registeredViaArray = $false
    foreach ($arrName in $exportedArrays) {
      if ($fc -match [regex]::Escape($arrName)) {
        $registeredViaArray = $true
        break
      }
    }

    # If patterns are registered via an array in the factory, skip individual class checks
    if ($registeredViaArray) { continue }

    $classMatches = [regex]::Matches($pc, 'export\s+class\s+(\w+Pattern)\b')
    foreach ($cm in $classMatches) {
      $className = $cm.Groups[1].Value
      if ($fc -notmatch [regex]::Escape($className)) {
        Warn "D28-PATTERN-FACTORY" "src/mods/${mn}/patterns/$($pf.Name)" "" "Pattern class '$className' not registered in pattern-factory.ts"
      }
    }
  }
}
$d28Errors = $E.Errors - $d28StartErrors
$d28Warnings = $E.Warnings - $d28StartWarnings
Write-Host "  D28-FACTORY     : $d28Errors errors, $d28Warnings warnings" -ForegroundColor $(if ($d28Errors -gt 0) { "Red" } elseif ($d28Warnings -gt 0) { "Yellow" } else { "Green" })

# === D31: Check init-mods.tsx includes all MODs ===
Write-Host "  [D31] Checking init-mods.tsx module completeness..." -ForegroundColor DarkGray
$d31StartErrors = $E.Errors
$d31StartWarnings = $E.Warnings
$initModsPath = Join-Path $projectRoot "src\app\_components\init-mods.tsx"
if (Test-Path $initModsPath) {
  $initContent = Get-FileContent $initModsPath
  if ($initContent) {
    $registrationEntryContent = $initContent
    foreach ($entryFile in @('init-mods-routes.ts', 'init-mods-bootstrap.ts')) {
      $entryPath = Join-Path $projectRoot "src\app\_components\${entryFile}"
      if (Test-Path $entryPath) {
        $registrationEntryContent += "`n" + (Get-FileContent $entryPath)
      }
    }

    # Pattern 1: centralized generated registry, including dynamically loaded
    # route/bootstrap leaves used to keep the first viewport bundle light.
    if ($registrationEntryContent -match "(?:from\s+|import\()'@/mods/registry'") {
      $registryPaths = @(
        (Join-Path $projectRoot "src\mods\registry.generated.ts"),
        (Join-Path $projectRoot "src\mods\registry.ts")
      )
      $registeredMods = @()
      foreach ($registryPath in $registryPaths) {
        if (-not (Test-Path $registryPath)) { continue }
        $regContent = Get-FileContent $registryPath
        if (-not $regContent) { continue }
        $manifestImports = [regex]::Matches($regContent, "import\s+\w+Manifest\s+from\s+'\./(mod-[a-z0-9-]+)/manifest'")
        foreach ($mi in $manifestImports) { $registeredMods += $mi.Groups[1].Value }
      }
      $registeredMods = @($registeredMods | Select-Object -Unique)
      if ($registeredMods.Count -eq 0) {
        Fail "D31-NO-REGISTRY" "src/mods/registry.ts" "" "registry.generated.ts missing or empty — run npm run generate:wiring"
      } else {
        foreach ($md in $modDirs) {
          $mn = $md.Name
          if ($mn -notin $registeredMods) {
            Fail "D31-UNREGISTERED-MOD" "src/mods/registry.generated.ts" "" "MOD '$mn' exists in src/mods/ but is not registered — run npm run generate:wiring"
          }
        }
        Write-Host "    Detected codegen registry pattern ($($registeredMods.Count) MODs registered)" -ForegroundColor DarkGray
      }
    }
    # Pattern 2: individual manifest imports (legacy)
    else {
      $importedMods = @()
      $importMatches = [regex]::Matches($initContent, "from\s+'@/mods/(mod-[a-z0-9-]+)/manifest'")
      foreach ($im in $importMatches) { $importedMods += $im.Groups[1].Value }

      foreach ($md in $modDirs) {
        $mn = $md.Name
        if ($mn -notin $importedMods) {
          Fail "D31-UNIMPORTED-MOD" "src/app/_components/init-mods.tsx" "" "MOD '$mn' exists in src/mods/ but is not imported in init-mods.tsx ALL_MANIFESTS"
        }
      }
    }
  }
}
$d31Errors = $E.Errors - $d31StartErrors
$d31Warnings = $E.Warnings - $d31StartWarnings
Write-Host "  D31-IMPORTED    : $d31Errors errors, $d31Warnings warnings" -ForegroundColor $(if ($d31Errors -gt 0) { "Red" } elseif ($d31Warnings -gt 0) { "Yellow" } else { "Green" })

# === D32: Check route page files exist ===
Write-Host "  [D32] Checking route page files exist..." -ForegroundColor DarkGray
$d32StartErrors = $E.Errors
$d32StartWarnings = $E.Warnings
foreach ($md in $modDirs) {
  $mn = $md.Name
  $manifestPath = Join-Path $md.FullName "manifest.ts"
  if (-not (Test-Path $manifestPath)) { continue }
  $mfContent = Get-FileContent $manifestPath
  if (-not $mfContent) { continue }

  $routeMatches = [regex]::Matches($mfContent, "\{\s*path:\s*'([^']+)'\s*,\s*page:\s*'([^']+)'\s*\}")
  foreach ($rm in $routeMatches) {
    $routePath = $rm.Groups[1].Value
    $pageName = $rm.Groups[2].Value
    $expectedPageFile = Join-Path $md.FullName "pages/$pageName/page.tsx"
    if (-not (Test-Path $expectedPageFile)) {
      Fail "D32-ROUTE-PAGE" "src/mods/${mn}/manifest.ts" "" "Route '$routePath' references page '$pageName' but pages/$pageName/page.tsx does not exist"
    }
  }
}
$d32Errors = $E.Errors - $d32StartErrors
$d32Warnings = $E.Warnings - $d32StartWarnings
Write-Host "  D32-ROUTE-PAGE : $d32Errors errors, $d32Warnings warnings" -ForegroundColor $(if ($d32Errors -gt 0) { "Red" } elseif ($d32Warnings -gt 0) { "Yellow" } else { "Green" })

# === D29: USE_PATTERN_MANAGER flag ===
Write-Host "  [D29] Checking USE_PATTERN_MANAGER flag..." -ForegroundColor DarkGray
$d29StartErrors = $E.Errors
$d29StartWarnings = $E.Warnings
foreach ($md in $modDirs) {
  $mn = $md.Name
  $subsDir = Join-Path $md.FullName "subsystems"
  if (-not (Test-Path $subsDir)) { continue }
  $hasPatternDir = Test-Path (Join-Path $md.FullName "patterns")
  $subFiles = @(Get-ChildItem -Path $subsDir -Filter "*-system.ts" -File -ErrorAction SilentlyContinue)
  foreach ($sf in $subFiles) {
    $sc = Get-FileContent $sf.FullName
    if (-not $sc) { continue }
    $sfRel = "src/mods/${mn}/subsystems/$($sf.Name)"
    if ($sc -match '\b(pattern|match|regex)\b' -and $sc -notmatch 'patternManager') {
      if ($hasPatternDir) {
        Warn "D29-PATTERN-FLAG" $sfRel "" "Subsystem uses pattern matching but doesn't reference patternManager"
      }
    }
    if ($sc -match '\bpatternManager\b' -and $sc -notmatch 'USE_PATTERN_MANAGER') {
      Warn "D29-PATTERN-FLAG" $sfRel "" "Subsystem uses patternManager but missing USE_PATTERN_MANAGER feature flag"
    }
  }
}
$d29Errors = $E.Errors - $d29StartErrors
$d29Warnings = $E.Warnings - $d29StartWarnings
Write-Host "  D29-FLAG        : $d29Errors errors, $d29Warnings warnings" -ForegroundColor $(if ($d29Errors -gt 0) { "Red" } elseif ($d29Warnings -gt 0) { "Yellow" } else { "Green" })

# === F4: patternManager try-catch ===
Write-Host "  [F4] Checking patternManager try-catch..." -ForegroundColor DarkGray
$f4StartErrors = $E.Errors
$f4StartWarnings = $E.Warnings
$allFilesF4 = $AllSrcFiles
foreach ($f in $allFilesF4) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  if ($fc -match 'patternManager\.') {
    $rel = $f.FullName.Substring($SrcDir.Length + 1).Replace('\','/')
    if ($fc -notmatch 'try\s*\{' -and $fc -notmatch 'catch\s*\(') {
      Warn "F4-PATTERN-TRY-CATCH" $rel "" "patternManager usage lacks try-catch error handling"
    }
  }
}
$f4Errors = $E.Errors - $f4StartErrors
$f4Warnings = $E.Warnings - $f4StartWarnings
Write-Host "  F4-TRY-CATCH    : $f4Errors errors, $f4Warnings warnings" -ForegroundColor $(if ($f4Errors -gt 0) { "Red" } elseif ($f4Warnings -gt 0) { "Yellow" } else { "Green" })
}
