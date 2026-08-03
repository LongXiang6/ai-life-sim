# Purpose: Run D19-D21, D34, and D35 smart-comparison checks after domain scanners.
# Owner: quality:infrastructure
# Responsibility: Skill-rule mapping, critical method wiring, and generated wiring freshness only.

if ($RunModPostScan) {
# -------------------------------------------------------
# 2.5 Smart Comparison: D19-D21 (Skill Rule Mapping)
# -------------------------------------------------------
Write-Host ""
Write-Host "========================================================"
Write-Host "  Smart Comparison - Skill Rules Mapping Verification"
Write-Host "========================================================" -ForegroundColor Cyan

$smart2StartErrors = $E.Errors
$smart2StartWarnings = $E.Warnings

# === D19: Subsystem method order verification ===
Write-Host "  [D19] Verifying subsystem lifecycle method order..." -ForegroundColor DarkGray
foreach ($md in $modDirs) {
  $mn = $md.Name
  $subDir = Join-Path $md.FullName "subsystems"
  if (-not (Test-Path $subDir)) { continue }
  $subFiles = @(Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
  foreach ($sf in $subFiles) {
    $sc = Get-FileContent $sf.FullName
    if (-not $sc) { continue }
    if ($sc -notmatch '(implements\s+ISubSystem\b|extends\s+BaseSubsystem\b)') { continue }
    $relFP = "src/mods/${mn}/subsystems/$($sf.Name)"
    $result = Test-FunctionOrder $sc $relFP @("collectState", "applyChanges", "reset") "subsystem"
    if (-not $result.AllFound) {
      Fail "D19-METHOD-ORDER" $relFP "" "subsystem implementation missing required method: $($result.MissingMethod)"
    } elseif ($result.OrderBroken) {
      Fail "D19-METHOD-ORDER" $relFP "" "'$($result.OutOfOrder)' appears out of order. Expected: collectState -> applyChanges -> reset"
    } else {
      Pass "D19-METHOD-ORDER" $relFP "subsystem methods in correct order: collectState -> applyChanges -> reset"
    }
  }
}

# === D20: File header completeness verification ===
Write-Host "  [D20] Verifying JSDoc header completeness..." -ForegroundColor DarkGray
$allSrcFilesD20 = @($AllSrcFiles | Where-Object { $_.Name -notmatch '^(page|layout|loading|error|not-found)\.tsx$' })
foreach ($f in $allSrcFilesD20) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Check file header has JSDoc with @module, @description
  $firstComment = [regex]::Match($fc, "/\*\*([\s\S]*?)\*/")
  if ($firstComment.Success) {
    $comment = $firstComment.Groups[1].Value
    if ($comment -notmatch '@module\s+\S') {
      Warn "D20-JSDOC-MODULE" $relFP "" "File header JSDoc missing @module tag"
    }
    if ($comment -notmatch '@description\s+\S') {
      Warn "D20-JSDOC-MODULE" $relFP "" "File header JSDoc missing @description tag"
    }
    if ($relFP -match '^src/mods/' -and $comment -notmatch '@mod\s+\S') {
      Warn "D20-JSDOC-MODULE" $relFP "" "MOD file header JSDoc missing @mod tag"
    }
  } elseif ($fc -match "^\s*(?:'use client'|import)" -and $f.Name -notmatch "\.(test|spec)\.tsx?$" -and $fc -notmatch '^\s*//') {
    Warn "D20-JSDOC-MODULE" $relFP "" "File missing JSDoc header comment block"
  }

  # Check exported functions have @param/@returns
  $jsDocIssues = Test-JsDocCompleteness $fc $relFP
  foreach ($issue in $jsDocIssues) {
    Warn "D20-JSDOC-FUNC" $relFP "" $issue
  }
}

# === D21: Function internal logic order verification ===
Write-Host "  [D21] Verifying function internal logic order..." -ForegroundColor DarkGray
# Check subsystem methods for proper logic order (validate -> compute -> return)
foreach ($f in $allSrcFilesD20) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")
  if ($relFP -notmatch 'subsystems/') { continue }

  # Check collectState for structuredClone usage
  if ($fc -match 'collectState\s*\(') {
    $csBody = [regex]::Match($fc, 'collectState\s*\([\s\S]*?\{([\s\S]*?)\n\s*\}')
    if ($csBody.Success) {
      $csContent = $csBody.Groups[1].Value
      # Only flag if collectState reads from store or external mutable data
      $readsFromStore = $csContent -match '(use\w+Store|\.getState\(\)|\w+Store\.|state\.\w+\[)'
      if ($readsFromStore -and $fc -notmatch 'structuredClone') {
        Warn "D21-STRUCT-CLONE" $relFP "" "collectState() should use structuredClone() for immutable state snapshot"
      }
    }
  }

  # Check applyChanges for input validation (subsystem implementation only; match method signature with type annotation)
  if ($fc -match 'applyChanges\s*\(\s*changes\s*:\s*SubSystemChanges') {
    $acBody = [regex]::Match($fc, 'applyChanges\s*\(\s*changes\s*:\s*SubSystemChanges[\s\S]*?\{([\s\S]*?)\n\s*\}')
    if ($acBody.Success) {
      $body = $acBody.Groups[1].Value
      if ($body -notmatch 'if\s*\(!' -and $body -notmatch 'if\s*\([''"]' -and $body -notmatch '\.hasOwnProperty' -and $body -notmatch 'typeof\s+\w+\s*[!=]==') {
        Warn "D21-INPUT-VALID" $relFP "" "applyChanges() should validate input changes before applying (if (!changes) etc.)"
      }
    }
  }
}

$smart2Errors = $E.Errors - $smart2StartErrors
$smart2Warnings = $E.Warnings - $smart2StartWarnings
Write-Host "  Smart Comparison : $smart2Errors        , $smart2Warnings        " -ForegroundColor $(if ($smart2Errors -gt 0) { "Red" } else { "Green" })

# -------------------------------------------------------
# 2.5b D34: Subsystem Method Usage Check
# -------------------------------------------------------
Write-Host ""
Write-Host "========================================================"
Write-Host "  D34 Subsystem Method Usage Check"
Write-Host "========================================================" -ForegroundColor Cyan

$d34StartErrors = $E.Errors
$d34StartWarnings = $E.Warnings

# Subsystem lifecycle methods that are always called by the engine
$subsystemLifecycleMethods = @('collectState', 'applyChanges', 'reset', 'advance', 'collectStateUpdate', 'collectStateFinalFix')

foreach ($md in $modDirs) {
  $mn = $md.Name
  $mp = Join-Path $md.FullName "manifest.ts"
  if (-not (Test-Path $mp)) { continue }
  $mc = Get-FileContent $mp
  if (-not $mc) { continue }

  # Extract subsystem class names from manifest subsystems array
  $subClassMatches = [regex]::Matches($mc, "class:\s*'(\w+)'")
  if ($subClassMatches.Count -eq 0) { continue }

  $subDir = Join-Path $md.FullName "subsystems"
  if (-not (Test-Path $subDir)) { continue }

  foreach ($scm in $subClassMatches) {
    $className = $scm.Groups[1].Value
    # Find the subsystem source file
    $subFile = $null
    $subFilesCandidates = @(Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
    foreach ($sf in $subFilesCandidates) {
      $sfc = Get-FileContent $sf.FullName
      if ($sfc -and $sfc -match "class $className") {
        $subFile = $sf
        break
      }
    }
    if (-not $subFile) { continue }

    $sc = Get-FileContent $subFile.FullName
    $subRelPath = "src/mods/${mn}/subsystems/$($subFile.Name)"

    # Extract public method names (excluding subsystem lifecycle methods and constructor)
    $methodMatches = [regex]::Matches($sc, '^\s*(?:public\s+|async\s+)?(?:public\s+)?(?:async\s+)?(\w+)\s*\(')
    $methodNames = @()
    foreach ($pm in $methodMatches) {
      $mname = $pm.Groups[1].Value
      if ($mname -eq 'constructor') { continue }
      if ($mname -in $subsystemLifecycleMethods) { continue }
      if ($mname.StartsWith('_')) { continue }
      $methodNames += $mname
    }
    if ($methodNames.Count -eq 0) { continue }

    # For each public method, check if it's called anywhere outside its own file
    foreach ($mname in $methodNames) {
      # Use rg for fast search
      $rgResult = & rg -l --glob "*.ts" --glob "*.tsx" "$mname\b" "$SrcDir" 2>$null | Where-Object { $_ -ne $subFile.FullName }
      if ($rgResult.Count -gt 0) { continue }

      # Check if exported via MOD's index.ts
      $idxPath = Join-Path $md.FullName "index.ts"
      $exportedViaIndex = $false
      if (Test-Path $idxPath) {
        $idxContent = Get-FileContent $idxPath
        if ($idxContent -match $mname) {
          $exportedViaIndex = $true
        }
      }
      if ($exportedViaIndex) { continue }

      Warn "D34-METHOD-UNUSED" $subRelPath "" "public method '$className.$mname()' is not called by any file — may indicate dead code"
    }
  }
}

$d34Errors = $E.Errors - $d34StartErrors
$d34Warnings = $E.Warnings - $d34StartWarnings
Write-Host "  D34 : $d34Errors errors, $d34Warnings warnings" -ForegroundColor $(if (($d34Errors + $d34Warnings) -gt 0) { "Yellow" } else { "Green" })

# -------------------------------------------------------
# 2.5b2 D34b: Narrative pipeline critical method wiring
# -------------------------------------------------------
Write-Host ""
Write-Host "  D34b Narrative critical method wiring..." -ForegroundColor DarkGray

$d34bStartErrors = $E.Errors
$orchestratorEntry = Join-Path $SrcDir "mods/mod-engine/subsystems/orchestrator-system.ts"
$campaignEntry = Join-Path $SrcDir "mods/mod-engine/campaigns/default/index.ts"
$pipelineContent = @(
  Get-ModuleResponsibilityContent $orchestratorEntry
  if (Test-Path $campaignEntry) { Get-FileContent $campaignEntry }
) -join "`n"
$narrativeCriticalMethods = @(
  'buildCreationTimelineEntries', 'buildNPCNetworkText', 'buildForeshadowingText', 'detectForeshadowing', 'resolveForeshadowing',
  'scoreImportance', 'setAISemanticAnalysis', 'recordNarrativeSignals', 'recordRelationshipUpdates',
  'getRelevantStates', 'buildNarrativeTimelineProjection',
  'buildPromptTimelineMemory', 'buildPhaseGuidance'
)
foreach ($m in $narrativeCriticalMethods) {
  if ($pipelineContent -notmatch "\b$([regex]::Escape($m))\s*\(") {
    Fail "D34b-NARRATIVE-UNWIRED" "mods/mod-engine" "" "Narrative-critical method '$m()' not called in orchestrator or default campaign — story continuity may break"
  }
}

$d34bErrors = $E.Errors - $d34bStartErrors
Write-Host "  D34b : $d34bErrors errors" -ForegroundColor $(if ($d34bErrors -gt 0) { "Red" } else { "Green" })

# -------------------------------------------------------
# 2.5c D35: MOD Wiring Codegen Freshness Check
# -------------------------------------------------------
Write-Host ""
Write-Host "========================================================"
Write-Host "  D35 MOD Wiring Codegen Check"
Write-Host "========================================================" -ForegroundColor Cyan

$d35StartErrors = $E.Errors
$genScript = Join-Path $scriptsRoot "codegen/generate-mod-wiring.mjs"

if (Test-Path $genScript) {
  $genOutput = & node $genScript --check 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    Fail "D35-WIRING-STALE" "scripts/codegen/generate-mod-wiring.mjs" "" "Generated wiring files are out of date. Run: npm run generate:wiring"
    if ($VerboseOutput) { Write-Host $genOutput -ForegroundColor DarkGray }
  }

  # 有 subsystems 声明的 MOD 必须出现在 mod-importers.generated.ts
  $importersPath = Join-Path $projectRoot "src/core/mod-loader/mod-importers.generated.ts"
  if (Test-Path $importersPath) {
    $importersContent = Get-FileContent $importersPath
    foreach ($md in $modDirs) {
      $mp = Join-Path $md.FullName "manifest.ts"
      if (-not (Test-Path $mp)) { continue }
      $mc = Get-FileContent $mp
      if (-not $mc) { continue }
      if ($mc -notmatch "subsystems:\s*\[") { continue }
      $subMatch = [regex]::Match($mc, "subsystems:\s*\[([^\]]+)\]")
      if (-not $subMatch.Success) { continue }
      $subRaw = $subMatch.Groups[1].Value.Trim()
      if (-not $subRaw -or $subRaw -eq '') { continue }
      $mn = $md.Name
      if ($importersContent -notmatch "'$mn'") {
        Fail "D35-MOD-IMPORTER-MISSING" "src/core/mod-loader/mod-importers.generated.ts" "" "MOD '$mn' has subsystems but missing from MOD_IMPORTERS — run npm run generate:wiring"
      }
    }
  }
} else {
  Write-Host "  [SKIP] generate-mod-wiring.mjs not found" -ForegroundColor DarkGray
}

$d35Errors = $E.Errors - $d35StartErrors
Write-Host "  D35 : $d35Errors errors" -ForegroundColor $(if ($d35Errors -gt 0) { "Red" } else { "Green" })
}
