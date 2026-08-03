# Purpose: Run MOD file responsibility, private export, subsystem boundary, and duplicate utility contracts.
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
. (Join-Path $contractRoot 'types-file-responsibility.ps1')
. (Join-Path $contractRoot 'constants-file-responsibility.ps1')
. (Join-Path $contractRoot 'utils-file-responsibility.ps1')
. (Join-Path $contractRoot 'subsystem-file-responsibility.ps1')
. (Join-Path $contractRoot 'index-file-responsibility.ps1')
. (Join-Path $contractRoot 'store-file-responsibility.ps1')
. (Join-Path $contractRoot 'hooks-file-responsibility.ps1')
. (Join-Path $contractRoot 'manifest-file-responsibility.ps1')
. (Join-Path $contractRoot 'prompt-file-responsibility.ps1')
. (Join-Path $contractRoot 'internal-type-export.ps1')
. (Join-Path $contractRoot 'private-constant-export.ps1')
. (Join-Path $contractRoot 'subsystem-helper-export.ps1')
. (Join-Path $contractRoot 'subsystem-write-boundary.ps1')
. (Join-Path $contractRoot 'duplicate-foundation-utility.ps1')

. (Join-Path $runtimeRoot 'complete.ps1') -ContractId 'mod-ownership-contracts'
