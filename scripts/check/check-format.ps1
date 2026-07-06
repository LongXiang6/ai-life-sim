<#
.SYNOPSIS
          -                
.DESCRIPTION
          
    arch-scanner   -    C1-C14, C18-C19, D1-D5, D25-D29, D33, E1, F1-F4, P1, C10, C13, G1-G10, H1-H4 
    post-scan      -    D19-D21, D34
    css-scanner    -    S16, S24-S26 (S1-S6, S16-S23, C8 consolidated)
    ui-scanner     - UI U1-U2, U4, U9-U16, C15-C16, F1 
    tsc --noEmit   - T1
    eslint         - T2

       code-architecture-skill + mod-engine-skill
.PARAMETER Path
       MOD       src/mods
.PARAMETER ModName
       MOD       mod-power-system
.PARAMETER VerboseOutput
.PARAMETER ReportFile
                        (Add-Content)
.EXAMPLE
  powershell -File scripts/check/check-format.ps1
  powershell -File scripts/check/check-format.ps1 -ModName mod-engine
  powershell -File scripts/check/check-format.ps1 -VerboseOutput
  powershell -File scripts/check/check-format.ps1 -ReportFile reports/checker.log
#>

param(
  [string]$Path = "src/mods",
  [string]$ModName = "",
  [switch]$VerboseOutput = $false,
  [string]$ReportFile = "",
  [string]$OutputDir = "",
  [switch]$ErrorOnly = $false,
  [switch]$Parallel = $false,
  [string]$Scanners = "arch,ui,css,smart,anomaly"
)

$ErrorActionPreference = "Continue"
$Global:ErrorOnly = $ErrorOnly.IsPresent
$Global:QuietConsole = ($env:CHECK_QUIET -eq '1')
if ($Global:QuietConsole -and -not $ErrorOnly.IsPresent) {
  $Global:ErrorOnly = $true
}
$ActiveScanners = @($Scanners -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$RunModPostScan = ($ActiveScanners -contains 'arch' -or $ActiveScanners -contains 'smart' -or $ActiveScanners -contains 'anomaly')

# Resolve default OutputDir to project root's reports/ directory
$checkDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptsRoot = Split-Path -Parent $checkDir
$projectRoot = Split-Path -Parent $scriptsRoot
if (-not $OutputDir) {
  $OutputDir = Join-Path $projectRoot "reports"
}

# -------------------------------------------------------
# 0.       
# -------------------------------------------------------
. (Join-Path $checkDir "lib/checker-utils.ps1")

$modScannerDir = [System.IO.Path]::Combine($checkDir, "domains", "mod")
$uiScannerDir = [System.IO.Path]::Combine($checkDir, "domains", "ui")

function Resolve-ScannerPath([string]$Name) {
  switch ($Name) {
    'arch'    { return Join-Path $modScannerDir 'arch-scanner.ps1' }
    'smart'   { return Join-Path $modScannerDir 'smart-scanner.ps1' }
    'anomaly' { return Join-Path $modScannerDir 'anomaly-scanner.ps1' }
    'ui'      { return Join-Path $uiScannerDir 'ui-scanner.ps1' }
    'css'     { return Join-Path $uiScannerDir 'css-scanner.ps1' }
    default   { return [System.IO.Path]::Combine($checkDir, "domains", "$Name", "$Name-scanner.ps1") }
  }
}

function Invoke-ScannerScript([string]$Name, [string]$ScannerPath) {
  if (-not $ScannerPath -or -not (Test-Path $ScannerPath)) {
    Fail "SCANNER-MISSING" "scripts/check" "" "scanner '$Name' not found: $ScannerPath"
    return
  }

  $prevErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Stop"
    . $ScannerPath
  } catch {
    Fail "SCANNER-EXEC" "scripts/check" "" "scanner '$Name' failed: $($_.Exception.Message)"
  } finally {
    $ErrorActionPreference = $prevErrorActionPreference
  }
}

# -------------------------------------------------------
# 1.       
# -------------------------------------------------------
$modsDir = Join-Path (Get-Location) $Path
if (-not (Test-Path $modsDir)) {
  Write-Host "   MOD       $modsDir" -ForegroundColor Red
  exit 1
}

if ($ModName) {
  $modDirs = @(Get-ChildItem -Path $modsDir -Directory | Where-Object { $_.Name -eq $ModName })
  if ($modDirs.Count -eq 0) {
    Write-Host "       MOD $ModName" -ForegroundColor Red
    exit 1
  }
} else {
  $modDirs = @(Get-ChildItem -Path $modsDir -Directory | Where-Object { $_.Name -match '^mod-' })
}

#    src/        style-scanner / ui-scanner    
$SrcDir = Split-Path $modsDir -Parent

# Pre-flight: validate PowerShell script encoding (fix UTF-16 → UTF-8)
Test-ScriptEncoding $checkDir

# -------------------------------------------------------
# 1.1            src             Get-ChildItem 
# -------------------------------------------------------
$AllSrcFiles = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' })
$AllTsFiles  = @($AllSrcFiles | Where-Object { $_.Extension -eq '.ts' })
$AllTsxFiles = @($AllSrcFiles | Where-Object { $_.Extension -eq '.tsx' })

# Preload all files into shared cache
Preload-AllFiles $SrcDir

# Setup output persistence
Set-OutputOptions $OutputDir $false

if (-not $Global:QuietConsole) {
  Write-Host ""
  Write-Host "========================================================"
  Write-Host "  Architecture & Code Quality Checker"
  Write-Host "     code-architecture-skill v4.0 + mod-engine-skill v1.0"
  Write-Host "     $($modDirs.Count) MODs + core/foundation/app"
  Write-Host "========================================================"
}

# -------------------------------------------------------
# 2.        
# -------------------------------------------------------
if ($Parallel.IsPresent) {
  Write-Host ""
  Write-Host "========================================================"
  Write-Host "  Running scanners in PARALLEL mode"
  Write-Host "========================================================" -ForegroundColor Cyan

  $scannerScripts = @(
    @{ Name="arch";  Path=(Resolve-ScannerPath 'arch') },
    @{ Name="ui";    Path=(Resolve-ScannerPath 'ui') },
    @{ Name="css";   Path=(Resolve-ScannerPath 'css') },
    @{ Name="smart"; Path=(Resolve-ScannerPath 'smart') },
    @{ Name="anomaly"; Path=(Resolve-ScannerPath 'anomaly') }
  ) | Where-Object { $ActiveScanners -contains $_.Name }
  $checkerUtilsPath = Join-Path $checkDir "lib/checker-utils.ps1"
  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "ai-life-checker-$([Guid]::NewGuid())"
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

  # Pass paths as strings for cross-runspace compatibility
  $modDirPaths = @($modDirs | ForEach-Object { $_.FullName })
  $srcDirPath = $SrcDir

  $parallelSuccess = $false
  $sw = [System.Diagnostics.Stopwatch]::StartNew()

  try {
    if ($PSVersionTable.PSVersion.Major -ge 7) {
      # PowerShell 7+: ForEach-Object -Parallel
      $scannerScripts | ForEach-Object -Parallel {
        $s = $_
        . $using:checkerUtilsPath

        $script:E = @{ Total=0; Errors=0; Warnings=0; Pass=0 }
        $script:Results = [System.Collections.ArrayList]::new()

        $modDirs = @(foreach ($p in $using:modDirPaths) { Get-Item $p })
        $Script:FileContentCache = @{}
        Preload-AllFiles $using:srcDirPath

        . $s.Path

        $output = @{
          ScannerName = $s.Name
          E = $E
          Results = @($Results | ForEach-Object @{Level=$_.Level; Rule=$_.Rule; File=$_.File; Line=$_.Line; Message=$_.Message})
        }
        $tempFile = Join-Path $using:tempDir "$($s.Name).json"
        $output | ConvertTo-Json -Depth 5 | Set-Content -Path $tempFile -Encoding UTF8
      } -ThrottleLimit 4

      $parallelSuccess = $true
    } else {
      # Windows PowerShell 5.x: Start-Job
      $jobs = @()
      foreach ($s in $scannerScripts) {
        $jobs += Start-Job -Name $s.Name -ArgumentList $s.Path, $s.Name, $checkerUtilsPath, $modDirPaths, $srcDirPath, $tempDir -ScriptBlock {
          param($scannerPath, $scannerName, $cuPath, $mdPaths, $srcd, $tmpd)

          . $cuPath

          $script:E = @{ Total=0; Errors=0; Warnings=0; Pass=0 }
          $script:Results = [System.Collections.ArrayList]::new()

          $modDirs = @(foreach ($p in $mdPaths) { Get-Item $p })
          $Script:FileContentCache = @{}
          Preload-AllFiles $srcd

          . $scannerPath

          $output = @{
            ScannerName = $scannerName
            E = $E
            Results = @($Results | ForEach-Object @{Level=$_.Level; Rule=$_.Rule; File=$_.File; Line=$_.Line; Message=$_.Message})
          }
          $tempFile = Join-Path $tmpd "$scannerName.json"
          $output | ConvertTo-Json -Depth 5 | Set-Content -Path $tempFile -Encoding UTF8
        }
      }

      $jobs | Wait-Job | Out-Null

      $jobFailed = $false
      foreach ($j in $jobs) {
        if ($j.State -eq 'Failed') {
          Write-Host "  [ERROR] Scanner '$($j.Name)' job failed" -ForegroundColor Red
          $jobFailed = $true
        }
        Receive-Job $j -ErrorAction SilentlyContinue | Out-Null
        Remove-Job $j -Force
      }

      if (-not $jobFailed) { $parallelSuccess = $true }
    }

    $sw.Stop()

    if ($parallelSuccess) {
      # Merge results from temp files into $E and $Results
      foreach ($s in $scannerScripts) {
        $tempFile = Join-Path $tempDir "$($s.Name).json"
        if (Test-Path $tempFile) {
          $data = (Get-FileContent $tempFile) | ConvertFrom-Json
          $E['Total']    += $data.E.Total
          $E['Errors']   += $data.E.Errors
          $E['Warnings'] += $data.E.Warnings
          $E['Pass']     += $data.E.Pass
          foreach ($r in $data.Results) {
            $item = [PSCustomObject]@{ Level=$r.Level; Rule=$r.Rule; File=$r.File; Line=$r.Line; Message=$r.Message }
            [void]$Results.Add($item)
          }
        }
      }
      Write-Host "  Parallel scanning completed in $([Math]::Round($sw.Elapsed.TotalSeconds,1))s" -ForegroundColor Green
    } else {
      throw "One or more scanner jobs failed"
    }
  } catch {
    $sw.Stop()
    Write-Host "  Parallel mode failed ($([Math]::Round($sw.Elapsed.TotalSeconds,1))s): $_" -ForegroundColor Yellow
    Write-Host "  Falling back to sequential mode..." -ForegroundColor Yellow

    # Reset counters (may contain partial merges)
    $E = @{ Total=0; Errors=0; Warnings=0; Pass=0 }
    $Results.Clear()

    # Sequential fallback
    foreach ($sn in $ActiveScanners) {
      $sp = Resolve-ScannerPath $sn
      Invoke-ScannerScript $sn $sp
    }
  } finally {
    Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
} else {
  # Sequential mode (default)
  foreach ($sn in $ActiveScanners) {
    $sp = Resolve-ScannerPath $sn
    Invoke-ScannerScript $sn $sp
  }
}

# Defensive: ensure $E is still a hashtable after scanners
if ($E -isnot [hashtable]) {
  Write-Host "  [WARN] Counter state corrupted, reinitializing..." -ForegroundColor DarkYellow
  $E = @{ Total=0; Errors=0; Warnings=0; Pass=0 }
}

# -------------------------------------------------------
# 2.5 Smart Comparison: D19-D21 (Skill Rule Mapping)
# -------------------------------------------------------
if ($RunModPostScan) {
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
$allSrcFilesD20 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' -and $_.Name -notmatch '^(page|layout|loading|error|not-found)\.tsx$' })
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
$narrativePipelineFiles = @(
  (Join-Path $SrcDir "mods/mod-engine/subsystems/orchestrator-system.ts"),
  (Join-Path $SrcDir "mods/mod-engine/campaigns/default/index.ts")
)
$pipelineContent = ($narrativePipelineFiles | Where-Object { Test-Path $_ } | ForEach-Object { Get-FileContent $_ }) -join "`n"
$narrativeCriticalMethods = @(
  'buildCoreMemory', 'buildForeshadowingText', 'detectForeshadowing', 'checkResolution',
  'scoreImportance', 'setAIRoundImportance', 'getRelevantStates', 'buildRichPrompt',
  'formatRichPromptForInjection', 'buildPhaseGuidance'
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

# -------------------------------------------------------
# 2.6 TypeScript Compiler Check (tsc --noEmit)
# -------------------------------------------------------
Write-Host ""
Write-Host "========================================================"
Write-Host "  TypeScript Compiler Check (tsc --noEmit)"
Write-Host "========================================================" -ForegroundColor Cyan

$tscStartErrors = $E.Errors
$tscStartWarnings = $E.Warnings

$tscOutput = $null
try {
  $tscOutput = & npx tsc --noEmit 2>&1 | Out-String
} catch {
  Write-Host "  [SKIP] npx tsc not available, skipping type check" -ForegroundColor DarkGray
}

if ($tscOutput) {
  $tscLines = $tscOutput -split "`n"
  $tscErrorCount = 0
  foreach ($tl in $tscLines) {
    if ($tl -match '^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$') {
      $tscFile = $Matches[1]
      $tscLine = $Matches[2]
      $tscCode = $Matches[4]
      $tscMsg = $Matches[5]
      # Make path relative to project
      if ($tscFile -match [regex]::Escape($projectRoot)) {
        $tscFile = $tscFile.Replace($projectRoot + "\", "").Replace("\", "/")
      }
      Fail "T1-TSC-ERROR" $tscFile "L$tscLine" "[$tscCode] $tscMsg"
      $tscErrorCount++
    }
  }
  if ($tscErrorCount -eq 0) {
    Write-Host "  [OK]   TypeScript compilation passed" -ForegroundColor Green
  }
} else {
  Write-Host "  [OK]   TypeScript compilation passed (no output)" -ForegroundColor Green
}

$tscErrors = $E.Errors - $tscStartErrors
$tscWarnings = $E.Warnings - $tscStartWarnings
Write-Host "  tsc --noEmit : $tscErrors errors found" -ForegroundColor $(if ($tscErrors -gt 0) { "Red" } else { "Green" })

# -------------------------------------------------------
# 2.7 ESLint Check (T2)
# -------------------------------------------------------
Write-Host ""
Write-Host "========================================================"
Write-Host "  ESLint Check"
Write-Host "========================================================" -ForegroundColor Cyan

$eslintStartErrors = $E.Errors
$eslintStartWarnings = $E.Warnings

try {
  $eslintOutput = & npx eslint . --ext .ts,.tsx --max-warnings 0 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0 -and $eslintOutput) {
    $eslintLines = $eslintOutput -split "`n"
    $currentFile = ""
    foreach ($el in $eslintLines) {
      # Match file paths (lines that look like paths containing "/" or "\")
      if ($el -match '^(.+?)[\\/]src[\\/](.+?\.(ts|tsx))$') {
        $currentFile = "src/$($Matches[2])" -replace '\\','/'
      }
      elseif ($el -match '^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(.+)$') {
        $lno = $Matches[1]
        $sev = $Matches[3]
        $msg = "$($Matches[4]) — $($Matches[5])"
        if ($currentFile) {
          if ($sev -eq 'error') {
            Fail "T2-ESLINT-ERROR" $currentFile "L$lno" $msg
          } else {
            Warn "T2-ESLINT-WARN" $currentFile "L$lno" $msg
          }
        }
      }
    }
  } else {
    Write-Host "  [OK]   ESLint passed (0 errors, 0 warnings)" -ForegroundColor Green
  }
} catch {
  Write-Host "  [SKIP] npx eslint not available, skipping ESLint check" -ForegroundColor DarkGray
}

$eslintErrors = $E.Errors - $eslintStartErrors
$eslintWarnings = $E.Warnings - $eslintStartWarnings
Write-Host "  ESLint      : $eslintErrors errors, $eslintWarnings warnings" -ForegroundColor $(if ($eslintErrors -gt 0) { "Red" } else { "Green" })

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
$allModFiles186 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })
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
    # Pattern 1: centralized registry.ts import (preferred)
    if ($initContent -match "from\s+'@/mods/registry'") {
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
$allFilesF4 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })
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

} # end $RunModPostScan

# -------------------------------------------------------
# 3. Summary    
# -------------------------------------------------------
if ($Global:QuietConsole) {
  if ($E.Errors -gt 0) {
    Write-Host "[check:mod] FAIL — $($E.Errors) error(s), $($E.Warnings) warn(s) (detail in reports/)" -ForegroundColor Red
  } else {
    Write-Host "[check:mod] PASS — $($E.Pass) checks, $($E.Warnings) warn(s) suppressed" -ForegroundColor Green
  }
} else {
Write-Host ""
Write-Host "========================================================"
Write-Host "  Check Summary"
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "       $($E.Total)"
Write-Host "  [FAIL]      $($E.Errors)" -ForegroundColor $(if ($E.Errors -gt 0) { "Red" } else { "Green" })
Write-Host "  [WARN]      $($E.Warnings)" -ForegroundColor $(if ($E.Warnings -gt 0) { "Yellow" } else { "Green" })
Write-Host "  [OK]        $($E.Pass)" -ForegroundColor Green
Write-Host ""
Write-Host "  前瞻事件 WARN（D8-ORPHAN-EMIT / D14-EMIT-UNUSED 等）通常可忽略，详见 .agents/skills/mod-dev-skill/" -ForegroundColor DarkGray
Write-Host ""
}

# -------------------------------------------------------
# 4.              
# -------------------------------------------------------
if (-not $Global:QuietConsole -and ($E.Errors -gt 0 -or $E.Warnings -gt 0)) {
  Write-Host "========================================================"
  Write-Host "  Issues by File"
  Write-Host "========================================================" -ForegroundColor Magenta

  $grouped = $Results | Group-Object File
  foreach ($g in $grouped) {
    $errCount = ($g.Group | Where-Object { $_.Level -eq 'ERROR' }).Count
    $warnCount = ($g.Group | Where-Object { $_.Level -eq 'WARN' }).Count
    $icon = if ($errCount -gt 0) { "[FAIL]" } else { "[WARN]" }
    $color = if ($errCount -gt 0) { "Red" } else { "Yellow" }
    Write-Host ""
    Write-Host "  $icon $($g.Name)  (   $errCount /    $warnCount)" -ForegroundColor $color
    foreach ($item in $g.Group) {
      $prefix = if ($item.Level -eq 'ERROR') { "    [FAIL] [$($item.Rule)]" } else { "    [WARN] [$($item.Rule)]" }
      Write-Host "$prefix $($item.Message)" -ForegroundColor $color
    }
  }
  Write-Host ""
}

# -------------------------------------------------------
# 5.    exit code
# -------------------------------------------------------
if (-not $Global:QuietConsole) {
if ($E.Errors -gt 0) {
  Write-Host "         - $($E.Errors)        " -ForegroundColor Red
} else {
  Write-Host "       " -ForegroundColor Green
}
}

# -------------------------------------------------------
# 6.         (Add-Content   )
# -------------------------------------------------------
if ($ReportFile) {
  $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $sep = "=" * 56
  
  #      timestamp      
  $header = @"
$sep
   $now
   $($modDirs.Count) MOD + core/foundation/app
   [FAIL] $($E.Errors)   [WARN] $($E.Warnings)   [OK] $($E.Pass)
$sep
"@
  Add-Content -Path $ReportFile -Value $header -Encoding UTF8

  $grouped = $Results | Group-Object File
  foreach ($g in $grouped) {
    Add-Content -Path $ReportFile -Value "" -Encoding UTF8
    $errCount = ($g.Group | Where-Object { $_.Level -eq 'ERROR' }).Count
    $warnCount = ($g.Group | Where-Object { $_.Level -eq 'WARN' }).Count
    $icon = if ($errCount -gt 0) { "[FAIL]" } else { "[WARN]" }
    Add-Content -Path $ReportFile -Value "  $icon $($g.Name)  (FAIL=$errCount / WARN=$warnCount)" -Encoding UTF8
    foreach ($item in $g.Group) {
      Add-Content -Path $ReportFile -Value "    [$($item.Level)] [$($item.Rule)] $($item.Message)" -Encoding UTF8
    }
  }
  
  Add-Content -Path $ReportFile -Value "" -Encoding UTF8
  Add-Content -Path $ReportFile -Value "       [FAIL] $($E.Errors)   [WARN] $($E.Warnings)   [OK] $($E.Pass)" -Encoding UTF8
  Add-Content -Path $ReportFile -Value $sep -Encoding UTF8
  Add-Content -Path $ReportFile -Value "" -Encoding UTF8
}

# Auto-save structured reports
Save-Reports $modDirs.Count

if ($E.Errors -gt 0) {
  exit 1
} else {
  exit 0
}
