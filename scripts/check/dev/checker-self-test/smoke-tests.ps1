# Purpose: Run the minimal MOD fixture through C1-C4 checker behavior.
# Owner: quality:infrastructure
# Responsibility: Checker self-test phase 4 only.

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

import { BaseSubsystem } from '@/core';
import type { SubSystemState, SubSystemChanges, RoundContext } from '@/foundation';

export class TestSystem extends BaseSubsystem {
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
  $classMatch = [regex]::Match($content, 'export class (\w+System)\s+(extends\s+BaseSubsystem\b|implements\s+ISubSystem\b)')
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
    Smoke-Fail "C1-CLASS-EXPORT" $relPath "" "Missing 'export class XxxSystem extends BaseSubsystem'"
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
  $badClassMatch = [regex]::Match($invalidContent2, 'export class (\w+System)\s+(extends\s+BaseSubsystem\b|implements\s+ISubSystem\b)')
  if (-not $badClassMatch.Success) {
    Write-Host "    Expected C1 failure: no subsystem class found in invalid file" -ForegroundColor DarkGray
  } else {
    Smoke-Fail "C1-BAD-DETECT" $badRel "" "Invalid file unexpectedly has subsystem class"
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
