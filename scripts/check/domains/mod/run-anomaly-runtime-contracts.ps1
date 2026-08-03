# Purpose: Run Prompt, subsystem, schema, Store, AI call, lifecycle, and migration anomaly contracts.
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
. (Join-Path $contractRoot 'anomaly-prompt-context.ps1')
. (Join-Path $contractRoot 'anomaly-orchestrator-method.ps1')
. (Join-Path $contractRoot 'anomaly-output-schema.ps1')
. (Join-Path $contractRoot 'anomaly-store-read-write.ps1')
. (Join-Path $contractRoot 'anomaly-ai-api-key.ps1')
. (Join-Path $contractRoot 'anomaly-lifecycle-export.ps1')
. (Join-Path $contractRoot 'anomaly-migration-file.ps1')

. (Join-Path $runtimeRoot 'complete.ps1') -ContractId 'mod-anomaly-runtime-contracts'
