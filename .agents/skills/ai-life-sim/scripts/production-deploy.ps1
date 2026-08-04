# Purpose: Upload the current committed project snapshot, rebuild production in place, and restart PM2.
# Owner: production-deployment
# Responsibility: Single local entry for the direct production update flow.

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-NativeSuccess {
  param([Parameter(Mandatory)][string]$Action)

  if ($LASTEXITCODE -ne 0) {
    throw "$Action failed with exit code $LASTEXITCODE"
  }
}

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
$remoteRunner = Join-Path $PSScriptRoot 'production-deploy-remote.sh'
if (-not (Test-Path -LiteralPath $remoteRunner -PathType Leaf)) {
  throw "Remote deployment runner is missing: $remoteRunner"
}

$runId = [Guid]::NewGuid().ToString('N')
$localArchive = Join-Path ([System.IO.Path]::GetTempPath()) "ai-life-sim-deploy-$runId.tar.gz"
$remoteArchive = "/tmp/ai-life-sim-deploy-$runId.tar.gz"
$remoteScript = "/tmp/ai-life-sim-deploy-$runId.sh"

try {
  Push-Location $projectRoot
  try {
    & git rev-parse --is-inside-work-tree | Out-Null
    Assert-NativeSuccess 'Resolve project Git repository'

    & git archive --format=tar.gz "--output=$localArchive" HEAD
    Assert-NativeSuccess 'Archive current HEAD'
  } finally {
    Pop-Location
  }

  & scp $localArchive "tencent-vm:$remoteArchive"
  Assert-NativeSuccess 'Upload project archive'

  & scp $remoteRunner "tencent-vm:$remoteScript"
  Assert-NativeSuccess 'Upload remote deployment runner'

  & ssh tencent-vm "sudo bash '$remoteScript' '$remoteArchive'"
  Assert-NativeSuccess 'Build and restart production service'
} finally {
  Remove-Item -LiteralPath $localArchive -Force -ErrorAction SilentlyContinue
}
