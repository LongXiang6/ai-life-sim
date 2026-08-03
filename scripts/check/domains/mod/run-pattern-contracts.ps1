# Purpose: Run MOD pattern layer, identifier, factory, feature-flag, and error-boundary contracts.
# Owner: quality:mod
# Responsibility: Initialize one shared read-only index, invoke fixed single-contract components, and publish one terminal result.

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
. (Join-Path $indexRoot 'pattern-source-index.ps1')

. (Join-Path $contractRoot 'pattern-layer-shape.ps1')
. (Join-Path $contractRoot 'pattern-class-inheritance.ps1')
. (Join-Path $contractRoot 'pattern-id-format.ps1')
. (Join-Path $contractRoot 'pattern-category.ps1')
. (Join-Path $contractRoot 'pattern-factory-registration.ps1')
. (Join-Path $contractRoot 'pattern-manager-feature-flag.ps1')
. (Join-Path $contractRoot 'pattern-manager-error-boundary.ps1')

. (Join-Path $runtimeRoot 'complete.ps1') -ContractId 'mod-pattern-contracts'
