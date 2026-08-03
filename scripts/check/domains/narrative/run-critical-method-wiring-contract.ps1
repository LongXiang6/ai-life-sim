# Purpose: Run narrative pipeline critical method wiring assertions.
# Owner: quality:narrative
# Responsibility: Initialize one read-only source context, invoke fixed single-contract components, and publish one terminal result.

param(
  [string]$Path = 'src/mods',
  [string]$ModName = '',
  [switch]$VerboseOutput,
  [switch]$ErrorOnly
)

$checkDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtimeRoot = Join-Path $checkDir 'lib/powershell-scanner'
. (Join-Path $runtimeRoot 'context.ps1') -Path $Path -ModName $ModName -Extensions @('.ts', '.tsx') `
  -VerboseOutput:$VerboseOutput.IsPresent -ErrorOnly:$ErrorOnly.IsPresent

$contractRoot = Join-Path $PSScriptRoot 'contracts'
. (Join-Path $contractRoot 'critical-method-wiring.ps1')

. (Join-Path $runtimeRoot 'complete.ps1') -ContractId 'narrative-critical-method-wiring'
