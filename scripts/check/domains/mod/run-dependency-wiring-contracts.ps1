# Purpose: Run MOD dependency, import, registration, event, capability, API, and reachability contracts.
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
. (Join-Path $indexRoot 'manifest-dependency-index.ps1')
. (Join-Path $indexRoot 'mod-tier-map.ps1')
. (Join-Path $indexRoot 'mod-manifest-index.ps1')
. (Join-Path $indexRoot 'source-usage-index.ps1')

. (Join-Path $contractRoot 'dependency-cycle.ps1')
. (Join-Path $contractRoot 'dependency-existence.ps1')
. (Join-Path $contractRoot 'dependency-direction.ps1')
. (Join-Path $contractRoot 'import-path-resolution.ps1')
. (Join-Path $contractRoot 'subsystem-registration-wiring.ps1')
. (Join-Path $contractRoot 'event-pairing.ps1')
. (Join-Path $contractRoot 'capability-wiring.ps1')
. (Join-Path $contractRoot 'store-registration-wiring.ps1')
. (Join-Path $contractRoot 'prompt-registration.ps1')
. (Join-Path $contractRoot 'route-page-resolution.ps1')
. (Join-Path $contractRoot 'api-delegation.ps1')
. (Join-Path $contractRoot 'event-declaration-alignment.ps1')
. (Join-Path $contractRoot 'public-import-name.ps1')
. (Join-Path $contractRoot 'imported-symbol-usage.ps1')
. (Join-Path $contractRoot 'default-mod-import.ps1')
. (Join-Path $contractRoot 'unused-public-export.ps1')
. (Join-Path $contractRoot 'dead-internal-export.ps1')
. (Join-Path $contractRoot 'dependency-prefix.ps1')

. (Join-Path $runtimeRoot 'complete.ps1') -ContractId 'mod-dependency-wiring-contracts'
