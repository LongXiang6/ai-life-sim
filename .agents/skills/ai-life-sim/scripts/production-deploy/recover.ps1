# Purpose: Discover or recover one interrupted production deployment.
# Owner: project-skill:ai-life-sim
# Responsibility: Recovery-mode input validation, remote recovery invocation, and state reconciliation only.

function Invoke-Recover {
  if ($PublishLocalHead -or $PlanPath -or $PlanSha256 -or $ReviewedDiffSha256 -or
      $ConfirmNoProductionPersistenceChange -or $PlayerMailboxV5Migration -or
      $GameRecordLifespanAdjustmentMigration -or $LogArchiveV1Migration) {
    throw 'recover mode only accepts optional -InterruptedRunId'
  }
  if ($InterruptedRunId -and $InterruptedRunId -notmatch '^[0-9a-f]{32}$') {
    throw 'invalid interrupted deployment GUID'
  }

  Assert-SkillScripts
  Set-Location $Repo
  Assert-DeploymentTargets
  $recoveryRunId = [guid]::NewGuid().ToString('N')
  if ($InterruptedRunId) {
    $remoteScript = "/root/ai-life-sim-deploy-state/$InterruptedRunId.recover.sh"
    $targetState = "/root/ai-life-sim-deploy-state/$InterruptedRunId.state"
    $recoveryOutput = & ssh tencent-vm (
      "sudo bash '$remoteScript' recover '$InterruptedRunId' '$recoveryRunId'"
    ) 2>&1
    $recoveryCode = $LASTEXITCODE
    $recoveryOutput | ForEach-Object { Write-Host $_ }
    $recoveryText = $recoveryOutput -join "`n"

    $stateOutput = & ssh tencent-vm (
      "sudo flock -w 900 /run/lock/ai-life-sim-deploy.lock cat '$targetState'"
    ) 2>&1
    $stateCode = $LASTEXITCODE
    $stateOutput | ForEach-Object { Write-Host $_ }
    if ($stateCode -ne 0) {
      throw "recovery result could not be reconciled; do not retry (recovery=$recoveryCode, state=$stateCode)"
    }
    if ($recoveryText -match 'RECOVERY_LOCK_TIMEOUT') {
      throw 'recovery lock timed out before any recovery action; rerun discovery, then retry the same run ID only if it remains the sole unresolved state'
    }
    if ($recoveryText -match 'RECOVERY_PREREQUISITE_MISSING') {
      throw 'a recovery prerequisite is missing before any recovery action; repair it, rerun discovery, then retry the same run ID only if it remains the sole unresolved state'
    }
    $stateText = $stateOutput -join "`n"
    $status = Get-UniqueStateField $stateText 'status' 'recovery'
    if ((Get-UniqueStateField $stateText 'state_schema' 'recovery') -ne '2' -or
        $status -ne 'RECOVERY_ROLLBACK_OK' -or
        (Get-UniqueStateField $stateText 'recovered_by' 'recovery') -ne $recoveryRunId -or
        (Get-UniqueStateField $stateText 'interrupted_status' 'recovery') -notmatch '^RUNNING_[A-Z_]+$' -or
        (Get-UniqueStateField $stateText 'commit' 'recovery') -notmatch '^[0-9a-f]{40}$' -or
        (Get-UniqueStateField $stateText 'expected_previous' 'recovery') -notmatch '^/root/ai-life-sim-releases/([0-9a-f]{7}|[0-9a-f]{40})$' -or
        (Get-UniqueStateField $stateText 'persistence_migration' 'recovery') -notmatch '^(none|player-mailbox-v5|game-record-lifespan-adjustments|log-archive-v1)$' -or
        (Get-UniqueStateField $stateText 'recovery_script' 'recovery') -ne $remoteScript -or
        (Get-UniqueStateField $stateText 'recovery_sha256' 'recovery') -notmatch '^[0-9a-f]{64}$') {
      throw "recovery did not prove the old runtime healthy; preserve all release and backup paths (exit $recoveryCode)"
    }
    if ($recoveryCode -ne 0) {
      Write-Host "SSH returned $recoveryCode, but the lock-owned state confirms RECOVERY_ROLLBACK_OK."
    }
    return
  }

  $remoteUpload = "/tmp/ai-life-sim-recover-$recoveryRunId.upload.sh"
  $remoteScript = "/tmp/ai-life-sim-recover-$recoveryRunId.sh"
  $localSnapshot = Join-Path ([System.IO.Path]::GetTempPath()) "ai-life-sim-recover-$recoveryRunId.snapshot.sh"
  if (Test-Path -LiteralPath $localSnapshot) {
    throw "local recovery snapshot path already exists: $localSnapshot"
  }
  $recoveryBytes = [System.IO.File]::ReadAllBytes($RecoveryRemoteScriptPath)
  $scriptHash = Get-BytesSha256 $recoveryBytes

  try {
    [System.IO.File]::WriteAllBytes($localSnapshot, $recoveryBytes)
    Invoke-NativeChecked 'upload recovery discovery script' {
      scp $localSnapshot "tencent-vm:$remoteUpload"
    }
    Invoke-NativeChecked 'install and verify root-owned recovery discovery script' {
      ssh tencent-vm (
        "sudo test ! -e '$remoteScript' && " +
        "sudo install -o root -g root -m 0700 '$remoteUpload' '$remoteScript' && " +
        "rm -f -- '$remoteUpload' && " +
        "echo '$scriptHash  $remoteScript' | sudo sha256sum -c - && " +
        "sudo bash -n '$remoteScript'"
      )
    }
    Invoke-NativeChecked 'list unresolved deployment states' {
      ssh tencent-vm "sudo bash '$remoteScript' list"
    }
  } finally {
    & ssh tencent-vm "sudo rm -f -- '$remoteUpload' '$remoteScript'" 2>$null
    if (Test-Path -LiteralPath $localSnapshot) {
      Remove-Item -LiteralPath $localSnapshot -Force
    }
  }
}
