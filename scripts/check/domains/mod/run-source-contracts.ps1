# Purpose: Run MOD root, subsystem, Prompt, public boundary, storage, and dependency alignment contracts.
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
. (Join-Path $indexRoot 'architecture-policy.ps1')
. (Join-Path $indexRoot 'runtime-subsystem-policy.ps1')
. (Join-Path $indexRoot 'public-boundary-policy.ps1')
. (Join-Path $indexRoot 'mod-source-index.ps1')

. (Join-Path $contractRoot 'architecture-policy-load.ps1')
. (Join-Path $contractRoot 'runtime-subsystem-policy-load.ps1')
. (Join-Path $contractRoot 'manifest-shape.ps1')
. (Join-Path $contractRoot 'prompt-template.ps1')
. (Join-Path $contractRoot 'public-entrypoint.ps1')
. (Join-Path $contractRoot 'subsystem-runtime.ps1')
. (Join-Path $contractRoot 'store-hook-shape.ps1')
. (Join-Path $contractRoot 'public-import-boundary.ps1')
. (Join-Path $contractRoot 'storage-key-shape.ps1')
. (Join-Path $contractRoot 'dependency-import-alignment.ps1')

. (Join-Path $runtimeRoot 'complete.ps1') -ContractId 'mod-source-contracts'
