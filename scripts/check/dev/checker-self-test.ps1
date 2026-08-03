# Purpose: Coordinate the checker infrastructure self-test phases.
# Owner: quality:infrastructure
# Responsibility: Initialize shared test state and load syntax, availability, scanner-contract, smoke, and safety phases in order.

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

$checkerSelfTestRoot = Join-Path $PSScriptRoot 'checker-self-test'
. (Join-Path $checkerSelfTestRoot 'syntax-tests.ps1')
. (Join-Path $checkerSelfTestRoot 'availability-tests.ps1')
. (Join-Path $checkerSelfTestRoot 'specialized-scanner-tests.ps1')
. (Join-Path $checkerSelfTestRoot 'smoke-tests.ps1')
. (Join-Path $checkerSelfTestRoot 'safety-summary.ps1')
