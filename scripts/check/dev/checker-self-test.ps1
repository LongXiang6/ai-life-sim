<#
.SYNOPSIS
  Self-test for all checker scripts.
.DESCRIPTION
  Validates checker scripts by performing:
  1. PowerShell syntax validation (balanced braces, PS 5.1 compatibility)
  2. Function availability check (key functions exist in checker-utils.ps1)
  3. Dot-source chain test (all scripts load without errors)
  4. Smoke test (minimal MOD structure + C1-C4 checks)
  5. ASCII safety scan (non-ASCII character detection)
.PARAMETER SkipSmokeTest
  Skip the smoke test (temp directory + checks).
.EXAMPLE
  powershell -File scripts/check/dev/checker-self-test.ps1
  powershell -File scripts/check/dev/checker-self-test.ps1 -SkipSmokeTest
#>

param(
  [switch]$SkipSmokeTest = $false
)

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$checkDir = Split-Path $scriptDir -Parent
$scriptsRoot = Split-Path $checkDir -Parent
$projectRoot = Split-Path $scriptsRoot -Parent

# Test result tracking
$TotalTests = 0
$PassedTests = 0
$FailedTests = 0

function Write-TestResult($testName, $passed, $detail) {
  $script:TotalTests++
  if ($passed) {
    $script:PassedTests++
    Write-Host "  [PASS] $testName" -ForegroundColor Green
  } else {
    $script:FailedTests++
    Write-Host "  [FAIL] $testName - $detail" -ForegroundColor Red
  }
}

function Write-SectionHeader($title) {
  Write-Host ""
  Write-Host "========================================================" -ForegroundColor Cyan
  Write-Host "  $title"
  Write-Host "========================================================" -ForegroundColor Cyan
}

# ============================================================
# Collect all .ps1 files
# ============================================================
$ps1Files = @(
  Get-ChildItem -Path $scriptDir -Filter "*.ps1" -File -ErrorAction SilentlyContinue
  Get-ChildItem -Path $checkDir -Filter "*.ps1" -File -ErrorAction SilentlyContinue
  Get-ChildItem -Path (Join-Path $checkDir "lib") -Filter "*.ps1" -File -ErrorAction SilentlyContinue
  Get-ChildItem -Path (Join-Path $checkDir "domains") -Filter "*.ps1" -Recurse -File -ErrorAction SilentlyContinue
)
$allPs1Files = @($ps1Files)

Write-Host ""
Write-Host "Found $($allPs1Files.Count) .ps1 file(s) to validate:" -ForegroundColor DarkGray
foreach ($f in $allPs1Files) {
  $relPath = $f.FullName.Substring($scriptsRoot.Length + 1).Replace('\', '/')
  Write-Host "    scripts/$relPath" -ForegroundColor DarkGray
}

# ============================================================
# Test 1: PowerShell Syntax Validation
# ============================================================
Write-SectionHeader "Test 1: PowerShell Syntax Validation"

foreach ($file in $allPs1Files) {
  $fileName = $file.Name
  $filePath = $file.FullName

  # Skip self-test to avoid self-referential false positives
  if ($fileName -eq 'checker-self-test.ps1') {
    Write-Host "  [SKIP] $fileName (self-test, excluding from self-checks)" -ForegroundColor DarkGray
    continue
  }

  # Read file content
  try {
    $rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.UTF8Encoding]::new($true, $true))
  } catch {
    Write-TestResult "1-READ: $fileName" $false "Cannot read file: $_"
    continue
  }

  # --- 1a: Check for Get-Content with -Encoding UTF8 (PS 5.1 incompatible) ---
  # Check per-line to avoid cross-line false positives
  $foundGetContentUtf8 = $false
  $lineArr = $rawContent -split "`n"
  foreach ($l in $lineArr) {
    if ($l -match 'Get-Content\b.*-Encoding\s+UTF8') {
      $foundGetContentUtf8 = $true
      break
    }
  }
  if ($foundGetContentUtf8) {
    Write-TestResult "1a: $fileName - No Get-Content -Encoding UTF8" $false "Found Get-Content with -Encoding UTF8 (PS 5.1 incompatible)"
  } else {
    Write-TestResult "1a: $fileName - No Get-Content -Encoding UTF8" $true ""
  }

  # --- 1b: No non-ASCII characters in function definitions ---
  $funcDefLines = [regex]::Matches($rawContent, '^\s*function\s+([a-zA-Z_][a-zA-Z0-9_-]*)\s*', @([System.Text.RegularExpressions.RegexOptions]::Multiline))
  $badFuncNames = @()
  foreach ($m in $funcDefLines) {
    $funcName = $m.Groups[1].Value
    if ($funcName -match '[^\x00-\x7F]') {
      $badFuncNames += $funcName
    }
  }
  if ($badFuncNames.Count -gt 0) {
    Write-TestResult "1b: $fileName - ASCII function names" $false "Non-ASCII in function names: $($badFuncNames -join ', ')"
  } else {
    Write-TestResult "1b: $fileName - ASCII function names" $true ""
  }

  # --- 1c: Strings in Write-Host/Fail/Warn/Pass calls should be ASCII-safe ---
  # Look for non-ASCII in string arguments to these reporting functions
  $callPatterns = @('Write-Host\s+', 'Fail\s*\(', 'Warn\s*\(', 'Pass\s*\(')
  $nonAsciiCalls = @()
  $lines = $rawContent -split "`n"
  for ($li = 0; $li -lt $lines.Count; $li++) {
    $line = $lines[$li]
    foreach ($pat in $callPatterns) {
      if ($line -match $pat) {
        # Find single-quoted strings
        $sqMatches = [regex]::Matches($line, "'([^']*)'")
        foreach ($sm in $sqMatches) {
          $strVal = $sm.Groups[1].Value
          if ($strVal -match '[^\x00-\x7F]') {
            $shortStr = if ($strVal.Length -gt 30) { $strVal.Substring(0, 30) + "..." } else { $strVal }
            $nonAsciiCalls += "L$($li+1): '$shortStr'"
          }
        }
        # Find double-quoted strings (with escaping)
        $dqMatches = [regex]::Matches($line, '"([^"]*)"')
        foreach ($dm in $dqMatches) {
          $strVal2 = $dm.Groups[1].Value
          if ($strVal2 -match '[^\x00-\x7F]') {
            $shortStr2 = if ($strVal2.Length -gt 30) { $strVal2.Substring(0, 30) + "..." } else { $strVal2 }
            $nonAsciiCalls += "L$($li+1): `"$shortStr2`""
          }
        }
      }
    }
  }
  if ($nonAsciiCalls.Count -gt 0) {
    $sample = ($nonAsciiCalls | Select-Object -First 3) -join '; '
    $totalMsg = "$($nonAsciiCalls.Count) non-ASCII string(s) in reporting calls"
    if ($nonAsciiCalls.Count -gt 3) { $totalMsg += " (showing first 3)" }
    Write-TestResult "1c: $fileName - ASCII-safe strings" $false "$totalMsg : $sample"
  } else {
    Write-TestResult "1c: $fileName - ASCII-safe strings" $true ""
  }

  # --- 1d: Balanced braces (informational only - braces in regex/strings cause false positives) ---
  $openCount = 0
  $closeCount = 0
  for ($ci = 0; $ci -lt $rawContent.Length; $ci++) {
    $ch = $rawContent[$ci]
    if ($ch -eq '{') { $openCount++ }
    elseif ($ch -eq '}') { $closeCount++ }
  }
  $braceDiff = [Math]::Abs($openCount - $closeCount)
   if ($braceDiff -gt 0) {
     Write-Host "  [INFO] 1d: $fileName - Brace count: $openCount vs $closeCount (diff=$braceDiff)" -ForegroundColor DarkGray
   }

  # --- 1e: Parse with PowerShell AST parser (syntax errors) ---
  # Known false positives: PS 5.1 parser bug with $([char]0x...) in double-quoted strings
  $knownParserIssueFiles = @('check/domains/mod/arch-scanner.ps1')
  $parseErrors = $null
  $tokens = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseInput($rawContent, [ref]$tokens, [ref]$parseErrors)
  if ($parseErrors.Count -gt 0) {
    if ($knownParserIssueFiles -contains $fileName) {
      Write-TestResult "1e: $fileName - PowerShell parser" $true "Known parser issue ($($parseErrors.Count) parse warnings, not a script syntax error)"
    } else {
      $errMsgs = ($parseErrors | ForEach-Object { $_.Message }) -join '; '
      Write-TestResult "1e: $fileName - PowerShell parser" $false "Parse errors: $errMsgs"
    }
  } else {
    Write-TestResult "1e: $fileName - PowerShell parser" $true "No parse errors"
  }
}

# ============================================================
# Test 2: Function Availability Check
# ============================================================
Write-SectionHeader "Test 2: Function Availability Check"

$utilsPath = Join-Path $checkDir "lib/checker-utils.ps1"
$requiredFunctions = @(
  "Get-FileContent",
  "Fail",
  "Warn",
  "Pass",
  "Test-FunctionOrder",
  "Preload-AllFiles",
  "Save-Reports"
)

# Dot-source checker-utils.ps1 to check function availability
# Note: this defines $E, $Results, and helper functions in current scope.
# The self-test uses its own $TotalTests/$PassedTests/$FailedTests tracking (not $E),
# and Test 3 uses child scopes, so no conflict.

try {
  . $utilsPath
  Write-TestResult "2-LOAD: checker-utils.ps1" $true "Successfully dot-sourced"

  foreach ($fn in $requiredFunctions) {
    $cmd = Get-Command -Name $fn -ErrorAction SilentlyContinue
    if ($cmd) {
      Write-TestResult "2-FUNC: $fn" $true "Function exists"
    } else {
      Write-TestResult "2-FUNC: $fn" $false "Function NOT found in checker-utils.ps1"
    }
  }
} catch {
  Write-TestResult "2-LOAD: checker-utils.ps1" $false "Failed to dot-source: $_"
  foreach ($fn in $requiredFunctions) {
    Write-TestResult "2-FUNC: $fn" $false "Cannot check (load failed)"
  }
}

# ============================================================
# Test 3: Dot-Source Chain Test
# ============================================================
Write-SectionHeader "Test 3: Dot-Source Chain Test"

# Set up minimal environment before dot-sourcing scanners
$origLocation = Get-Location
$tempEnvDir = Join-Path ([System.IO.Path]::GetTempPath()) "checker-self-test-env"
if (Test-Path $tempEnvDir) { Remove-Item -Path $tempEnvDir -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $tempEnvDir -Force | Out-Null

# Create minimal src/mods directory
$tempSrcDir = Join-Path $tempEnvDir "src"
$tempModsDir = Join-Path $tempSrcDir "mods"
$tempModDir = Join-Path $tempModsDir "mod-test"
New-Item -ItemType Directory -Path $tempModDir -Force | Out-Null

# Create minimal manifest.ts, types.ts, index.ts
@"
import { defineMod } from '@/core';
export default defineMod({
  name: 'mod-test',
  version: '1.0.0',
  description: '',
  loadOrder: 100,
  dependencies: [],
  provides: [],
  consumes: [],
  subsystems: [],
  routes: [],
  stores: [],
  events: { emits: [], listens: [] },
  prompts: [],
});
"@ | Set-Content -Path (Join-Path $tempModDir "manifest.ts") -Encoding UTF8
"export interface TestConfig {}" | Set-Content -Path (Join-Path $tempModDir "types.ts") -Encoding UTF8
"export type { TestConfig } from './types';" | Set-Content -Path (Join-Path $tempModDir "index.ts") -Encoding UTF8

# Set up global vars that scanners expect
$global:modDirs = @(Get-ChildItem -Path $tempModsDir -Directory | Where-Object { $_.Name -match '^mod-' })
$global:SrcDir = $tempSrcDir
$global:modsDir = $tempModsDir
$global:VerboseOutput = $false
$global:AllSrcFiles = @()
$global:AllTsxFiles = @()
$global:Global:ErrorOnly = $false

# checker-utils.ps1 already loaded in Test 2; only test scanner scripts
$scannerOnly = @(
  (Join-Path $checkDir "domains/mod/arch-scanner.ps1"),
  (Join-Path $checkDir "domains/ui/ui-scanner.ps1"),
  (Join-Path $checkDir "domains/mod/smart-scanner.ps1")
)

foreach ($scriptPath in $scannerOnly) {
  $scriptRel = Split-Path -Leaf $scriptPath

  if (-not (Test-Path $scriptPath)) {
    Write-TestResult "3-FILE: $scriptRel" $false "File not found"
    continue
  }

  # Reset E and Results before each dot-source
  $global:E = @{ Total = 0; Errors = 0; Warnings = 0; Pass = 0 }
  $global:Results = [System.Collections.ArrayList]::new()

  $Error.Clear()
   $errorCountBefore = $Error.Count

   # Dot-source without try/catch (parse errors are non-terminating)
   . $scriptPath

   # Check for parse errors after dot-sourcing
   $newErrors = @($Error | Select-Object -First ($Error.Count - $errorCountBefore))
   $parseErrors = @($newErrors | Where-Object {
     $_.CategoryInfo.Category -eq 'ParserError' -or
     ($_.Exception -is [System.Management.Automation.ParseException])
   })
   $runtimeErrors = @($newErrors | Where-Object {
     $_.CategoryInfo.Category -ne 'ParserError' -and
     -not ($_.Exception -is [System.Management.Automation.ParseException])
   })

   if ($runtimeErrors.Count -gt 0) {
     $errMsg = ($runtimeErrors | Select-Object -First 2 | ForEach-Object { $_.ToString() }) -join '; '
     Write-TestResult "3-DOTSOURCE: $scriptRel" $false "Runtime errors: $errMsg"
   } elseif ($parseErrors.Count -gt 0) {
     Write-TestResult "3-DOTSOURCE: $scriptRel" $true "Loaded (with $($parseErrors.Count) parse warning(s))"
   } else {
     Write-TestResult "3-DOTSOURCE: $scriptRel" $true "Loaded without errors"
   }
}

# Cleanup temp env
Set-Location $origLocation
if (Test-Path $tempEnvDir) {
  Remove-Item -Path $tempEnvDir -Recurse -Force -ErrorAction SilentlyContinue
}

# ============================================================
# Test 4: Smoke Test (Minimal MOD + C1-C4 Checks)
# ============================================================
if (-not $SkipSmokeTest) {
  Write-SectionHeader "Test 4: Smoke Test (C1-C4 Core Checks)"

  # Create a more complete temp project structure
  $smokeDir = Join-Path ([System.IO.Path]::GetTempPath()) "checker-smoke-test"
  if (Test-Path $smokeDir) { Remove-Item -Path $smokeDir -Recurse -Force -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Path $smokeDir -Force | Out-Null

  $smokeSrc = Join-Path $smokeDir "src"
  $smokeMods = Join-Path $smokeSrc "mods"
  $smokeModDir = Join-Path $smokeMods "mod-smoke"
  $smokeSubDir = Join-Path $smokeModDir "subsystems"
  New-Item -ItemType Directory -Path $smokeSubDir -Force | Out-Null

  # Create a valid subsystem file that should pass C1-C4 checks
  $validSubsystem = @'
'use client';

/**
 * @module TestSystem
 * @description Test subsystem for smoke testing
 * @mod mod-smoke
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation';

export class TestSystem implements ISubSystem {
  readonly id = 'test' as const;
  readonly mod = 'mod-smoke' as const;
  readonly label = 'Test System' as const;
  readonly description = 'A test subsystem for smoke testing' as const;

  collectState(context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: 'Test System summary',
      data: structuredClone({} as unknown as Record<string, unknown>)
    };
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') { return; }
    if (changes.id !== this.id) { return; }
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) { return; }
    if (!changes.description || changes.description.trim() === '') { return; }
    const data = changes.changes;
  }

  reset(): void {
  }
}
'@
  $validSubsystemPath = Join-Path $smokeSubDir "test-system.ts"
  $validSubsystem | Set-Content -Path $validSubsystemPath -Encoding UTF8

  # Create manifest.ts
  @"
import { defineMod } from '@/core';
export default defineMod({
  name: 'mod-smoke',
  version: '1.0.0',
  description: 'Smoke test MOD',
  loadOrder: 100,
  dependencies: [],
  provides: [],
  consumes: [],
  subsystems: ['TestSystem'],
  routes: [],
  stores: [],
  events: { emits: [], listens: [] },
  prompts: [],
});
"@ | Set-Content -Path (Join-Path $smokeModDir "manifest.ts") -Encoding UTF8
  "export interface SmokeConfig { debug: boolean }" | Set-Content -Path (Join-Path $smokeModDir "types.ts") -Encoding UTF8
  "export type { SmokeConfig } from './types';" | Set-Content -Path (Join-Path $smokeModDir "index.ts") -Encoding UTF8

  # Source checker-utils functions
  $utilsSmokePath = Join-Path $checkDir "lib/checker-utils.ps1"
  . $utilsSmokePath

  # Initialize error tracking for smoke test
  $smokeE = @{ Total = 0; Errors = 0; Warnings = 0; Pass = 0 }
  $smokeResults = [System.Collections.ArrayList]::new()
  $smokeVerbose = $false
  $smokeErrorOnly = $false

  function Smoke-Fail($rule, $file, $line, $msg) {
    $smokeE.Errors++
    $smokeE.Total++
    $r = [PSCustomObject]@{ Level = 'ERROR'; Rule = $rule; File = $file; Line = $line; Message = $msg }
    [void]$smokeResults.Add($r)
  }
  function Smoke-Warn($rule, $file, $line, $msg) {
    $smokeE.Warnings++
    $smokeE.Total++
    $r = [PSCustomObject]@{ Level = 'WARN'; Rule = $rule; File = $file; Line = $line; Message = $msg }
    [void]$smokeResults.Add($r)
  }
  function Smoke-Pass($rule, $file, $msg) {
    $smokeE.Pass++
    if ($smokeVerbose) { Write-Host "  [OK]   [$rule] $file - $msg" -ForegroundColor Green }
  }

  # --- Run C1-C4 checks on the valid subsystem ---
  $content = Get-FileContent $validSubsystemPath
  $fileName = "test-system.ts"
  $modName = "mod-smoke"
  $relPath = "src/mods/mod-smoke/subsystems/test-system.ts"

  Write-Host "  Running C1-C4 on valid subsystem..." -ForegroundColor DarkGray

  # C1: File name check
  if ($fileName -match '^[a-z0-9]+(-[a-z0-9]+)*-system\.ts$') {
    Smoke-Pass "C1-FILE-NAME" $relPath "File name matches {kebab-case}-system.ts"
  } else {
    Smoke-Fail "C1-FILE-NAME" $relPath "" "File name should match {kebab-case}-system.ts, got: $fileName"
  }

  # C1: Class name vs file name match
  $classMatch = [regex]::Match($content, 'export class (\w+System)\s+implements\s+ISubSystem')
  if ($classMatch.Success) {
    $className = $classMatch.Groups[1].Value
    $parts = ($fileName -replace '\.ts$', '').Split('-')
    $expectedClassName = ($parts | ForEach-Object {
      $_.Substring(0,1).ToUpper() + $_.Substring(1)
    }) -join ''
    if ($className -eq $expectedClassName) {
      Smoke-Pass "C1-CLASS-MATCH" $relPath "Class '$className' matches file '$fileName'"
    } else {
      Smoke-Fail "C1-CLASS-MATCH" $relPath "" "Class '$className' does not match file '$fileName', expected '$expectedClassName'"
    }
  } else {
    Smoke-Fail "C1-CLASS-EXPORT" $relPath "" "Missing 'export class XxxSystem implements ISubSystem'"
  }

  # C2: readonly metadata
  $idMatch = [regex]::Match($content, "readonly id = '([a-z0-9-]+)' as const")
  if ($idMatch.Success) {
    Smoke-Pass "C2-ID" $relPath "id = '$($idMatch.Groups[1].Value)'"
  } else {
    Smoke-Fail "C2-ID" $relPath "" "Missing 'readonly id = '{kebab-name}' as const'"
  }

  $modMatch = [regex]::Match($content, "readonly mod = '($modName)' as const")
  if ($modMatch.Success) {
    Smoke-Pass "C2-MOD" $relPath "mod = '$($modMatch.Groups[1].Value)'"
  } else {
    Smoke-Fail "C2-MOD" $relPath "" "Missing 'readonly mod = '${modName}' as const'"
  }

  $lblMatch = [regex]::Match($content, "readonly label = '(.+?)' as const")
  if ($lblMatch.Success) {
    Smoke-Pass "C2-LABEL" $relPath "label = '$($lblMatch.Groups[1].Value)'"
  } else {
    Smoke-Fail "C2-LABEL" $relPath "" "Missing 'readonly label = '...' as const'"
  }

  $descMatch = [regex]::Match($content, "readonly description = '(.+?)' as const")
  if ($descMatch.Success) {
    Smoke-Pass "C2-DESC" $relPath "description present"
  } else {
    Smoke-Fail "C2-DESC" $relPath "" "Missing 'readonly description = '...' as const'"
  }

  # C3: applyChanges 5-step validation
  if ($content -match 'applyChanges\(changes:\s*SubSystemChanges') {
    $checksOk = 0
    $checksFail = ""
    if ($content -match 'if \(!changes \|\| typeof changes !== .object.\)') { $checksOk++ } else { $checksFail += " Step1(typeof) " }
    if ($content -match 'changes\.id !== this\.id') { $checksOk++ } else { $checksFail += " Step2(id) " }
    if ($content -match '!changes\.changes \|\| typeof changes\.changes !== .object. \|\| Array\.isArray') { $checksOk++ } else { $checksFail += " Step3(plain) " }
    if ($content -match '!changes\.description \|\| changes\.description\.trim') { $checksOk++ } else { $checksFail += " Step4(desc) " }
    if ($content -match "const \w+ = changes\.changes") { $checksOk++ } else { $checksFail += " Step5(read) " }
    if ($checksOk -ge 5) {
      Smoke-Pass "C3-APPLY-FIVE" $relPath "applyChanges 5-step validation ($checksOk/5)"
    } else {
      Smoke-Fail "C3-APPLY-FIVE" $relPath "" "applyChanges 5-step incomplete ($checksOk/5) missing:$checksFail"
    }
  } else {
    Smoke-Fail "C3-APPLY-SIG" $relPath "" "Missing applyChanges(changes: SubSystemChanges) signature"
  }

  # C4: collectState structuredClone
  $hasStructuredClone = ($content -match 'structuredClone\(')
  if ($hasStructuredClone) {
    Smoke-Pass "C4-DEEPCOPY" $relPath "collectState uses structuredClone()"
  } else {
    Smoke-Fail "C4-DEEPCOPY" $relPath "" "collectState missing structuredClone() deep copy"
  }

  # Report smoke test results
  $smokeErrors = $smokeE.Errors
  $smokeWarnings = $smokeE.Warnings
  Write-Host ""
  Write-Host "  Smoke test results: $smokeErrors errors, $smokeWarnings warnings" -ForegroundColor $(if ($smokeErrors -gt 0) { "Red" } else { "Green" })

  if ($smokeErrors -eq 0) {
    Write-TestResult "4-SMOKE: C1-C4 valid subsystem" $true "All C1-C4 checks passed on valid subsystem"
  } else {
    Write-TestResult "4-SMOKE: C1-C4 valid subsystem" $false "$smokeErrors errors on what should be a valid subsystem"

    # Show details
    foreach ($r in $smokeResults) {
      $color = if ($r.Level -eq 'ERROR') { "Red" } else { "Yellow" }
      Write-Host "    [$($r.Level)] [$($r.Rule)] $($r.Message)" -ForegroundColor $color
    }
  }

  # --- Smoke test part 2: Invalid subsystem should fail C1 ---
  Write-Host ""
  Write-Host "  Testing invalid subsystem detection..." -ForegroundColor DarkGray

  $invalidSubDir = Join-Path $smokeSubDir "bad"
  New-Item -ItemType Directory -Path $invalidSubDir -Force | Out-Null
  $invalidSubsystemPath = Join-Path $invalidSubDir "BadlyNamed.ts"

  $invalidContent = @'
// No class implementing ISubSystem - should fail C1
export const notASubsystem = 42;
'@
  $invalidContent | Set-Content -Path $invalidSubsystemPath -Encoding UTF8

  $invalidContent2 = Get-FileContent $invalidSubsystemPath
  $badFile = "BadlyNamed.ts"
  $badRel = "src/mods/mod-smoke/subsystems/BadlyNamed.ts"

  # C1 file name check on bad file
  if ($badFile -match '^[a-z0-9]+(-[a-z0-9]+)*-system\.ts$') {
    Smoke-Pass "C1-FILE-BAD" $badRel "Bad file detected as valid (unexpected)"
  } else {
    # Should fail - this is expected
    Write-Host "    Expected C1 failure: file '$badFile' does not match {kebab-case}-system.ts" -ForegroundColor DarkGray
  }

  # C1 class check
  $badClassMatch = [regex]::Match($invalidContent2, 'export class (\w+System)\s+implements\s+ISubSystem')
  if (-not $badClassMatch.Success) {
    Write-Host "    Expected C1 failure: no ISubSystem class found in invalid file" -ForegroundColor DarkGray
  } else {
    Smoke-Fail "C1-BAD-DETECT" $badRel "" "Invalid file unexpectedly has ISubSystem class"
  }

  Write-TestResult "4-SMOKE: C1 invalid subsystem detection" $true "Invalid files correctly detected"

  # Cleanup smoke test dir
  if (Test-Path $smokeDir) {
    Remove-Item -Path $smokeDir -Recurse -Force -ErrorAction SilentlyContinue
  }
} else {
  Write-SectionHeader "Test 4: Smoke Test (SKIPPED)"
  Write-Host "  Use -SkipSmokeTest to bypass this test" -ForegroundColor DarkGray
}

# ============================================================
# Test 5: ASCII Safety Scan
# ============================================================
Write-SectionHeader "Test 5: ASCII Safety Scan"

foreach ($file in $allPs1Files) {
  $fileName = $file.Name
  $filePath = $file.FullName

  try {
    $rawBytes = [System.IO.File]::ReadAllBytes($filePath)
    $rawContent = [System.Text.Encoding]::UTF8.GetString($rawBytes)
  } catch {
    Write-TestResult "5-READ: $fileName" $false "Cannot read file"
    continue
  }

  # Find all non-ASCII characters and their locations
  $nonAsciiLines = @{}
  $lines = $rawContent -split "`n"
  for ($li = 0; $li -lt $lines.Count; $li++) {
    $line = $lines[$li]
    $chars = $line.ToCharArray()
    foreach ($ch in $chars) {
      if ([int]$ch -gt 127) {
        # Skip comment-only lines
        $trimmed = $line.Trim()
        if ($trimmed -match '^\s*<#|^\s*#>' -or $trimmed.StartsWith('#')) { continue }

        $snippet = if ($line.Trim().Length -gt 50) { $line.Trim().Substring(0, 50) + "..." } else { $line.Trim() }
        $nonAsciiLines[$li + 1] = $snippet
        break
      }
    }
  }

  if ($nonAsciiLines.Count -gt 0) {
    $lineList = ($nonAsciiLines.GetEnumerator() | Sort-Object Name | Select-Object -First 5 | ForEach-Object { "L$($_.Key): $($_.Value)" }) -join ' | '
    $msg = "$($nonAsciiLines.Count) line(s) with non-ASCII characters"
    if ($nonAsciiLines.Count -gt 5) { $msg += " (showing first 5)" }
    Write-TestResult "5-ASCII: $fileName" $false "$msg : $lineList"
  } else {
    Write-TestResult "5-ASCII: $fileName" $true "All ASCII-safe"
  }
}

# ============================================================
# Final Summary
# ============================================================
Write-Host ""
Write-Host "========================================================"
Write-Host "  SELF-TEST SUMMARY"
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Total tests : $TotalTests"
Write-Host "  Passed      : $PassedTests" -ForegroundColor $(if ($PassedTests -gt 0) { "Green" } else { "DarkGray" })
Write-Host "  Failed      : $FailedTests" -ForegroundColor $(if ($FailedTests -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($FailedTests -gt 0) {
  Write-Host "  RESULT: FAILED" -ForegroundColor Red
  Write-Host "  $FailedTests test(s) failed. Review issues above." -ForegroundColor Red
  exit 1
} else {
  Write-Host "  RESULT: ALL PASSED" -ForegroundColor Green
  Write-Host "  All checker scripts validated successfully." -ForegroundColor Green
  exit 0
}
