# Purpose: Run responsive variant, theme, and Manifest route UI architecture contracts.
# Owner: quality:ui
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
. (Join-Path $contractRoot 'responsive-organism-variants.ps1')
. (Join-Path $contractRoot 'theme-id.ps1')
. (Join-Path $contractRoot 'theme-attribute.ps1')
. (Join-Path $contractRoot 'manifest-route-page.ps1')

. (Join-Path $runtimeRoot 'complete.ps1') -ContractId 'ui-architecture-contracts'
