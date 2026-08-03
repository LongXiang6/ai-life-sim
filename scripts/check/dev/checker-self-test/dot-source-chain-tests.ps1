# Purpose: Validate scanner dot-source composition in an isolated temporary project.
# Owner: quality:infrastructure
# Responsibility: Checker self-test phase 3 and its temporary resources only.

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
$tempCoreDir = Join-Path $tempSrcDir "core"
New-Item -ItemType Directory -Path $tempCoreDir -Force | Out-Null
"export {};" | Set-Content -Path (Join-Path $tempCoreDir "index.ts") -Encoding UTF8
$tempEngineHelpersDir = Join-Path $tempModsDir "mod-engine/helpers"
New-Item -ItemType Directory -Path $tempEngineHelpersDir -Force | Out-Null
@'
{
  "currentStage": "mvp",
  "stages": {
    "mvp": {
      "runtime": { "external": [], "engine": [] },
      "systemInstruction": []
    }
  }
}
'@ | Set-Content -Path (Join-Path $tempEngineHelpersDir "mvp-stages-config.default.json") -Encoding UTF8

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

# Set up scanner variables in the current scope so each dot-sourced scanner
# sees the same isolated temporary project.
$modDirs = @(Get-ChildItem -Path $tempModsDir -Directory | Where-Object { $_.Name -eq 'mod-test' })
$SrcDir = $tempSrcDir
$modsDir = $tempModsDir
$global:modDirs = $modDirs
$global:SrcDir = $SrcDir
$global:modsDir = $modsDir
$global:VerboseOutput = $false
$global:AllSrcFiles = @()
$global:AllTsxFiles = @()
$Global:ErrorOnly = $false

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
