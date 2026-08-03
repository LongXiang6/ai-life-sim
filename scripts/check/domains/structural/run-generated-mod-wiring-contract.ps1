# Purpose: Run generated MOD wiring freshness and importer completeness contracts.
# Owner: quality:structural
# Responsibility: Initialize one read-only source context, invoke fixed single-contract components, and publish one terminal result.

param(
  [string]$Path = 'src/mods',
  [string]$ModName = '',
  [switch]$VerboseOutput,
  [switch]$ErrorOnly
)

$checkDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtimeRoot = Join-Path $checkDir 'lib/powershell-scanner'
. (Join-Path $runtimeRoot 'context.ps1') -Path $Path -ModName $ModName -Extensions @() `
  -VerboseOutput:$VerboseOutput.IsPresent -ErrorOnly:$ErrorOnly.IsPresent

$contractRoot = Join-Path $PSScriptRoot 'contracts'
. (Join-Path $contractRoot 'generated-mod-wiring.ps1')

. (Join-Path $runtimeRoot 'complete.ps1') -ContractId 'structural-generated-mod-wiring'
