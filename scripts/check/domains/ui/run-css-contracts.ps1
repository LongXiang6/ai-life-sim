# Purpose: Run CSS alias, custom-property consistency, deprecation, and token whitelist contracts.
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
. (Join-Path $runtimeRoot 'context.ps1') -Path $Path -ModName $ModName -Extensions @('.ts', '.tsx', '.css') `
  -VerboseOutput:$VerboseOutput.IsPresent -ErrorOnly:$ErrorOnly.IsPresent

$indexRoot = Join-Path $PSScriptRoot 'indexes'
$contractRoot = Join-Path $PSScriptRoot 'contracts'
. (Join-Path $indexRoot 'css-variable-index.ps1')
. (Join-Path $contractRoot 'css-alias-path.ps1')
. (Join-Path $contractRoot 'css-variable-consistency.ps1')
. (Join-Path $contractRoot 'deprecated-css-variable.ps1')
. (Join-Path $contractRoot 'unknown-css-variable.ps1')

. (Join-Path $runtimeRoot 'complete.ps1') -ContractId 'ui-css-contracts'
