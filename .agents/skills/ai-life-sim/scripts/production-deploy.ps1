# Purpose: Dispatch the production plan, execute, or recovery transaction.
# Owner: project-skill:ai-life-sim
# Responsibility: Stable CLI parameters, deployment constants, component loading, and mode dispatch only.

[CmdletBinding()]
param(
  [Parameter(Mandatory, Position = 0)]
  [ValidateSet('plan', 'execute', 'recover')]
  [string]$Mode,

  [switch]$PublishLocalHead,
  [string]$PlanPath,
  [string]$PlanSha256,
  [string]$ReviewedDiffSha256,
  [switch]$ConfirmNoProductionPersistenceChange,
  [switch]$PlayerMailboxV5Migration,
  [switch]$GameRecordLifespanAdjustmentMigration,
  [switch]$LogArchiveV1Migration,
  [string]$InterruptedRunId,
  [string]$LocalNodeDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$DriverScriptPath = $PSCommandPath

$Repo = 'D:\AI\ai-life-sim'
$Workspace = 'D:\AI'
$DeployRemoteScriptPath = Join-Path $PSScriptRoot 'production-deploy-remote.sh'
$RecoveryRemoteScriptPath = Join-Path $PSScriptRoot 'production-recover-remote.sh'
$LocalNodeVersion = '20.20.2'
$LocalNodeArchiveSha256 = 'dc3700fdd57a63eedb8fd7e3c7baaa32e6a740a1b904167ff4204bc68ed8bf77'
$ExpectedOriginUrl = 'https://github.com/LongXiang6/ai-life-sim.git'
$ExpectedSshHost = '49.235.100.36'
$ExpectedSshUser = 'ubuntu'
$ExpectedSshPort = '22'
$ExpectedSshIdentityFile = 'D:\AI\.secrets\ssh\GPT.pem'
$ExpectedSshHostFingerprint = 'SHA256:LuCkfXN/qk/iZTrLhj3PfP/h6QiMqDpkRDfBreTSCuQ'
$OriginalLocation = Get-Location

$productionDeployRoot = Join-Path $PSScriptRoot 'production-deploy'
. (Join-Path $productionDeployRoot 'common.ps1')
. (Join-Path $productionDeployRoot 'target-validation.ps1')
. (Join-Path $productionDeployRoot 'plan.ps1')
. (Join-Path $productionDeployRoot 'execute.ps1')
. (Join-Path $productionDeployRoot 'recover.ps1')

try {
  switch ($Mode) {
    'plan' { Invoke-Plan }
    'execute' { Invoke-Execute }
    'recover' { Invoke-Recover }
  }
} finally {
  Set-Location $OriginalLocation
}
