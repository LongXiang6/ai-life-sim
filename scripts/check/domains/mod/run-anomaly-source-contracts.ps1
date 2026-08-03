# Purpose: Run source import, React state, source layout, and MOD storage anomaly contracts.
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
. (Join-Path $runtimeRoot 'context.ps1') -Path $Path -ModName $ModName -Extensions @('.ts', '.tsx', '.css') `
  -VerboseOutput:$VerboseOutput.IsPresent -ErrorOnly:$ErrorOnly.IsPresent

$indexRoot = Join-Path $PSScriptRoot 'indexes'
$contractRoot = Join-Path $PSScriptRoot 'contracts'
. (Join-Path $contractRoot 'anomaly-import-path.ps1')
. (Join-Path $contractRoot 'anomaly-react-state.ps1')
. (Join-Path $contractRoot 'anomaly-source-layout.ps1')
. (Join-Path $contractRoot 'anomaly-local-storage.ps1')

. (Join-Path $runtimeRoot 'complete.ps1') -ContractId 'mod-anomaly-source-contracts'
