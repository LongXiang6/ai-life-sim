# Purpose: Run one cached TSX traversal plus UI boundary and component layering contracts.
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

$indexRoot = Join-Path $PSScriptRoot 'indexes'
$contractRoot = Join-Path $PSScriptRoot 'contracts'
. (Join-Path $indexRoot 'tsx-check-registry.ps1')
. (Join-Path $contractRoot 'native-dialog.ps1')
. (Join-Path $contractRoot 'inline-style-tokens.ps1')
. (Join-Path $contractRoot 'nested-ternary.ps1')
. (Join-Path $contractRoot 'component-export-name.ps1')
. (Join-Path $contractRoot 'interactive-accessibility.ps1')
. (Join-Path $contractRoot 'next-component-usage.ps1')
. (Join-Path $contractRoot 'global-style-import.ps1')

Invoke-UiTsxChecks
. (Join-Path $contractRoot 'internal-import-boundary.ps1')
. (Join-Path $contractRoot 'component-layering.ps1')
. (Join-Path $contractRoot 'root-html-language.ps1')

. (Join-Path $runtimeRoot 'complete.ps1') -ContractId 'ui-tsx-contracts'
