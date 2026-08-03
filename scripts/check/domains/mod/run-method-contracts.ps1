# Purpose: Run subsystem method order, source documentation, input snapshot, and reachability contracts.
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
. (Join-Path $indexRoot 'mod-manifest-index.ps1')
. (Join-Path $indexRoot 'source-usage-index.ps1')

. (Join-Path $contractRoot 'subsystem-method-order.ps1')
. (Join-Path $contractRoot 'source-jsdoc.ps1')
. (Join-Path $contractRoot 'subsystem-input-snapshot.ps1')
. (Join-Path $contractRoot 'unused-subsystem-method.ps1')

. (Join-Path $runtimeRoot 'complete.ps1') -ContractId 'mod-method-contracts'
