# Purpose: Execute one locked production deployment transaction and reconcile its terminal state.
# Owner: project-skill:ai-life-sim
# Responsibility: Execute-mode validation, packaging, upload, remote invocation, and terminal reconciliation only.

function Invoke-Execute {
  if ($PublishLocalHead -or $InterruptedRunId) {
    throw 'execute mode does not accept -PublishLocalHead or -InterruptedRunId'
  }
  if (-not $PlanPath -or -not $PlanSha256 -or -not $ReviewedDiffSha256) {
    throw 'execute mode requires -PlanPath, -PlanSha256, and -ReviewedDiffSha256'
  }
  $selectedPersistenceModes = @()
  if ($ConfirmNoProductionPersistenceChange) { $selectedPersistenceModes += 'none' }
  if ($PlayerMailboxV5Migration) { $selectedPersistenceModes += 'player-mailbox-v5' }
  if ($GameRecordLifespanAdjustmentMigration) { $selectedPersistenceModes += 'game-record-lifespan-adjustments' }
  if ($LogArchiveV1Migration) { $selectedPersistenceModes += 'log-archive-v1' }
  if ($selectedPersistenceModes.Count -ne 1) {
    throw 'execute mode requires exactly one persistence confirmation or migration switch'
  }

  Assert-SkillScripts
  Set-Location $Repo
  Assert-DeploymentTargets

  if (-not (Test-Path -LiteralPath $PlanPath -PathType Leaf)) {
    throw 'deployment plan is missing'
  }
  $planBytes = [System.IO.File]::ReadAllBytes($PlanPath)
  $actualPlanHash = Get-BytesSha256 $planBytes
  if ($actualPlanHash -ne $PlanSha256.ToLowerInvariant()) {
    throw 'deployment plan hash changed; regenerate it'
  }
  $planJson = [System.Text.UTF8Encoding]::new($false, $true).GetString($planBytes)
  $plan = $planJson | ConvertFrom-Json
  if ($plan.schemaVersion -ne 3 -or [string]$plan.repo -ne $Repo) {
    throw 'unsupported deployment plan'
  }

  $commit = [string]$plan.commit
  $originBefore = [string]$plan.originBefore
  $needsPush = [bool]$plan.needsPush
  $activeRelease = [string]$plan.activeRelease
  $activeCommit = [string]$plan.activeCommit
  $deployRunId = [string]$plan.deployRunId
  $plannedDiffSha256 = [string]$plan.productionDiffSha256
  $plannedPersistenceMigration = [string]$plan.persistenceMigration
  $requestedPersistenceMigration = [string]$selectedPersistenceModes[0]
  if ($commit -notmatch '^[0-9a-f]{40}$' -or
      $originBefore -notmatch '^[0-9a-f]{40}$' -or
      $activeCommit -notmatch '^[0-9a-f]{40}$' -or
      $deployRunId -notmatch '^[0-9a-f]{32}$' -or
      $plannedDiffSha256 -notmatch '^[0-9a-f]{64}$' -or
      $activeRelease -notmatch '^/root/ai-life-sim-releases/([0-9a-f]{7}|[0-9a-f]{40})$') {
    throw 'deployment plan contains invalid identifiers'
  }
  if ($plannedPersistenceMigration -notin @('none', 'player-mailbox-v5', 'game-record-lifespan-adjustments', 'log-archive-v1') -or
      $plannedPersistenceMigration -ne $requestedPersistenceMigration) {
    throw 'deployment persistence migration does not match the locked plan'
  }
  if ($ReviewedDiffSha256.ToLowerInvariant() -ne $plannedDiffSha256) {
    throw 'reviewed production diff hash does not match the locked plan'
  }
  $driverBytes = [System.IO.File]::ReadAllBytes($DriverScriptPath)
  $deployRemoteBytes = [System.IO.File]::ReadAllBytes($DeployRemoteScriptPath)
  $recoveryRemoteBytes = [System.IO.File]::ReadAllBytes($RecoveryRemoteScriptPath)
  if ([string]$plan.driverSha256 -ne (Get-BytesSha256 $driverBytes) -or
      [string]$plan.deployRemoteSha256 -ne (Get-BytesSha256 $deployRemoteBytes) -or
      [string]$plan.recoveryRemoteSha256 -ne (Get-BytesSha256 $recoveryRemoteBytes)) {
    throw 'deployment Skill scripts changed after planning; regenerate the plan'
  }

  Invoke-NativeChecked 'verify planned commit object' { git cat-file -e "$commit^{commit}" }
  Sync-OriginMainRef -Label 'refresh origin/main before execution'
  $currentOrigin = Get-NativeText 'resolve origin/main before execution' {
    git rev-parse --verify 'refs/remotes/origin/main^{commit}'
  }
  if ($needsPush) {
    if ($currentOrigin -ne $originBefore) {
      throw 'origin/main changed after planning; regenerate the plan'
    }
  } elseif ($currentOrigin -ne $commit) {
    throw 'origin/main changed after planning; regenerate the plan'
  }
  $currentActiveRelease = Get-NativeText 'resolve active release before execution' {
    ssh tencent-vm 'sudo readlink -f /root/ai-life-sim'
  }
  if ($currentActiveRelease -ne $activeRelease) {
    throw 'production changed after planning; regenerate the plan'
  }
  Assert-ProductionPersistenceLayout $currentActiveRelease
  if (-not (Test-GitAncestor $activeCommit $commit)) {
    throw 'planned candidate is no longer a normal forward deployment'
  }
  $currentDiffSha256 = Get-ProductionDiffSha256 `
    -FromCommit $activeCommit `
    -ToCommit $commit `
    -RunId $deployRunId
  if ($currentDiffSha256 -ne $plannedDiffSha256) {
    throw 'production diff bytes changed after review; regenerate the plan'
  }

  $treeListing = Get-NativeText 'inspect candidate tree' { git ls-tree -r $commit }
  if ($treeListing -match '(?m)^160000 ') {
    throw 'candidate contains a submodule; git archive would omit its contents'
  }
  $trackedNames = Get-NativeLines 'list candidate files' {
    git ls-tree -r --name-only $commit
  }
  Assert-NoForbiddenTrackedSecretPaths -Paths $trackedNames -Context 'candidate'
  $attributeFiles = @($trackedNames | Where-Object { $_ -match '(^|/)\.gitattributes$' })
  foreach ($attributeFile in $attributeFiles) {
    $attributeContent = Get-NativeText "inspect $attributeFile" {
      git show "${commit}:$attributeFile"
    }
    if ($attributeContent -match '(?im)export-(ignore|subst)|filter\s*=|working-tree-encoding') {
      throw "$attributeFile changes archive contents outside the validated tree"
    }
  }
  $infoAttributesPath = Get-NativeText 'resolve local Git attributes path' {
    git rev-parse --git-path info/attributes
  }
  if ((Test-Path -LiteralPath $infoAttributesPath) -and
      (Get-Content -Raw -LiteralPath $infoAttributesPath).Trim()) {
    throw 'local .git/info/attributes must be empty because it can change git archive'
  }
  $lfsPointers = @(& git grep -l '^version https://git-lfs.github.com/spec/v1$' $commit -- 2>$null)
  $lfsCode = $LASTEXITCODE
  if ($lfsCode -notin @(0, 1)) { throw "Git LFS pointer scan failed with exit code $lfsCode" }
  if ($lfsCode -eq 0) {
    throw "candidate contains Git LFS pointer files: $($lfsPointers -join ', ')"
  }

  $nodeRuntime = Resolve-Node20Runtime
  Write-Host "LOCAL_NODE_RUNTIME=$($nodeRuntime.Node) source=$($nodeRuntime.Source)"
  $validationTree = Join-Path (Split-Path -Parent $Repo) "ai-life-sim-validate-$deployRunId"
  if (Test-Path -LiteralPath $validationTree) {
    throw "validation worktree path already exists: $validationTree"
  }
  $validationAdded = $false
  try {
    Invoke-NativeChecked 'create validation worktree' {
      git worktree add --detach $validationTree $commit
    }
    $validationAdded = $true
    Push-Location $validationTree
    try {
      $oldPath = $env:PATH
      $oldPuppeteerSkip = $env:PUPPETEER_SKIP_DOWNLOAD
      try {
        $env:PATH = "$($nodeRuntime.Bin)$([System.IO.Path]::PathSeparator)$oldPath"
        $env:PUPPETEER_SKIP_DOWNLOAD = '1'
        Assert-Node20 -NodePath $nodeRuntime.Node
        Invoke-NativeChecked 'install validation dependencies' { & $nodeRuntime.Npm ci }
        Invoke-NativeChecked 'run formal release gate' { & $nodeRuntime.Npm run gate-check }
      } finally {
        $env:PATH = $oldPath
        $env:PUPPETEER_SKIP_DOWNLOAD = $oldPuppeteerSkip
      }
      $trackedStatus = Get-NativeText 'check validation tree after gate' {
        git status --short --untracked-files=no
      }
      if ($trackedStatus) {
        throw "release gate changed tracked files:`n$trackedStatus"
      }
    } finally {
      Pop-Location
    }
  } finally {
    if ($validationAdded) {
      Invoke-NativeChecked 'remove validation worktree' {
        git worktree remove --force $validationTree
      }
    }
  }

  Sync-OriginMainRef -Label 'refresh origin/main after gate'
  $originAfterGate = Get-NativeText 'resolve origin/main after gate' {
    git rev-parse --verify 'refs/remotes/origin/main^{commit}'
  }
  if ($needsPush) {
    if ($originAfterGate -ne $originBefore) {
      throw 'origin/main changed during validation; regenerate the plan'
    }
    Invoke-NativeChecked 'push validated commit to main' {
      git push origin "${commit}:refs/heads/main"
    }
    Sync-OriginMainRef -Label 'confirm pushed origin/main'
    $publishedCommit = Get-NativeText 'resolve pushed origin/main' {
      git rev-parse --verify 'refs/remotes/origin/main^{commit}'
    }
    if ($publishedCommit -ne $commit) {
      throw 'origin/main does not equal the validated commit after push'
    }
  } else {
    if ($originAfterGate -ne $commit) {
      throw 'origin/main changed during validation; regenerate the plan'
    }
  }

  Sync-OriginMainRef -Label 'final refresh of origin/main'
  $finalOriginCommit = Get-NativeText 'final resolve of origin/main' {
    git rev-parse --verify 'refs/remotes/origin/main^{commit}'
  }
  if ($finalOriginCommit -ne $commit) {
    throw 'origin/main changed before packaging; regenerate the plan'
  }
  $expectedPrevious = Get-NativeText 'refresh active production release before packaging' {
    ssh tencent-vm 'sudo readlink -f /root/ai-life-sim'
  }
  if ($expectedPrevious -ne $activeRelease) {
    throw 'active production changed during validation; regenerate the plan'
  }
  $expectedPreviousCommit = $activeCommit

  $release = "/root/ai-life-sim-releases/$commit"
  $remoteArchiveUpload = "/tmp/ai-life-sim-$commit-$deployRunId.upload.tar.gz"
  $remoteArchive = "/tmp/ai-life-sim-$commit-$deployRunId.tar.gz"
  $remoteScriptUpload = "/tmp/ai-life-sim-deploy-$deployRunId.upload.sh"
  $remoteScript = "/tmp/ai-life-sim-deploy-$deployRunId.sh"
  $remoteRecoveryUpload = "/tmp/ai-life-sim-recover-$deployRunId.upload.sh"
  $remoteRecoveryScript = "/root/ai-life-sim-deploy-state/$deployRunId.recover.sh"
  $remoteState = "/root/ai-life-sim-deploy-state/$deployRunId.state"
  $archive = Join-Path ([System.IO.Path]::GetTempPath()) "ai-life-sim-$commit-$deployRunId.tar.gz"
  $deployScriptSnapshot = Join-Path ([System.IO.Path]::GetTempPath()) "ai-life-sim-deploy-$deployRunId.snapshot.sh"
  $recoveryScriptSnapshot = Join-Path ([System.IO.Path]::GetTempPath()) "ai-life-sim-recover-$deployRunId.snapshot.sh"
  foreach ($path in @($archive, $deployScriptSnapshot, $recoveryScriptSnapshot)) {
    if (Test-Path -LiteralPath $path) {
      throw "local deployment input path already exists: $path"
    }
  }

  $remoteExecutionStarted = $false
  $deploymentSucceeded = $false
  try {
    [System.IO.File]::WriteAllBytes($deployScriptSnapshot, $deployRemoteBytes)
    [System.IO.File]::WriteAllBytes($recoveryScriptSnapshot, $recoveryRemoteBytes)
    Invoke-NativeChecked 'archive validated commit' {
      git archive --format=tar.gz --output=$archive $commit
    }
    if ((Get-Item -LiteralPath $archive).Length -eq 0) {
      throw 'local release archive is empty'
    }
    $archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    $scriptHash = Get-BytesSha256 $deployRemoteBytes
    $recoveryScriptHash = Get-BytesSha256 $recoveryRemoteBytes

    Invoke-NativeChecked 'upload release archive' {
      scp $archive "tencent-vm:$remoteArchiveUpload"
    }
    Invoke-NativeChecked 'upload deployment script' {
      scp $deployScriptSnapshot "tencent-vm:$remoteScriptUpload"
    }
    Invoke-NativeChecked 'upload recovery script snapshot' {
      scp $recoveryScriptSnapshot "tencent-vm:$remoteRecoveryUpload"
    }
    Invoke-NativeChecked 'install and verify root-owned deployment inputs' {
      ssh tencent-vm (
        "sudo install -d -o root -g root -m 0700 '/root/ai-life-sim-deploy-state' && " +
        "sudo test ! -e '$remoteArchive' && " +
        "sudo test ! -e '$remoteScript' && " +
        "sudo test ! -e '$remoteRecoveryScript' && " +
        "sudo test ! -e '$remoteState' && " +
        "sudo install -o root -g root -m 0600 '$remoteArchiveUpload' '$remoteArchive' && " +
        "sudo install -o root -g root -m 0700 '$remoteScriptUpload' '$remoteScript' && " +
        "sudo install -o root -g root -m 0700 '$remoteRecoveryUpload' '$remoteRecoveryScript' && " +
        "rm -f -- '$remoteArchiveUpload' '$remoteScriptUpload' '$remoteRecoveryUpload' && " +
        "echo '$archiveHash  $remoteArchive' | sudo sha256sum -c - && " +
        "echo '$scriptHash  $remoteScript' | sudo sha256sum -c - && " +
        "echo '$recoveryScriptHash  $remoteRecoveryScript' | sudo sha256sum -c - && " +
        "sudo bash -n '$remoteScript'"
      )
    }

    $remoteExecutionStarted = $true
    $deployOutput = & ssh tencent-vm (
      "sudo bash '$remoteScript' '$release' '$remoteArchive' '$commit' '$deployRunId' " +
      "'$expectedPrevious' '$expectedPreviousCommit' '$archiveHash' " +
      "'$remoteRecoveryScript' '$recoveryScriptHash' '$plannedPersistenceMigration'"
    ) 2>&1
    $deployCode = $LASTEXITCODE
    $deployOutput | ForEach-Object { Write-Host $_ }
    $deployText = $deployOutput -join "`n"

    $stateOutput = & ssh tencent-vm (
      "sudo flock -w 900 /run/lock/ai-life-sim-deploy.lock cat '$remoteState'"
    ) 2>&1
    $stateReadCode = $LASTEXITCODE
    $stateOutput | ForEach-Object { Write-Host $_ }
    if ($stateReadCode -ne 0) {
      if ($deployText -match 'DEPLOY_LOCK_TIMEOUT') {
        throw 'deployment lock timed out before the critical section; regenerate the plan'
      }
      if ($deployText -match 'DEPLOY_PREREQUISITE_MISSING') {
        throw 'remote deployment prerequisite is missing before state creation; repair the named prerequisite, then regenerate the plan'
      }
      throw "deployment result could not be reconciled; do not retry (deploy=$deployCode, state=$stateReadCode)"
    }
    if ($deployText -match '(?m)^RUN_ID_EXISTS ') {
      throw 'deployment run ID already exists; regenerate the plan with a new GUID'
    }

    $stateText = $stateOutput -join "`n"
    $deploymentStatus = Get-UniqueStateField $stateText 'status' 'deployment'
    if ((Get-UniqueStateField $stateText 'state_schema' 'deployment') -ne '2' -or
        (Get-UniqueStateField $stateText 'commit' 'deployment') -ne $commit -or
        (Get-UniqueStateField $stateText 'expected_previous' 'deployment') -ne $expectedPrevious -or
        (Get-UniqueStateField $stateText 'expected_previous_commit' 'deployment') -ne $expectedPreviousCommit -or
        (Get-UniqueStateField $stateText 'release' 'deployment') -ne $release -or
        (Get-UniqueStateField $stateText 'backup' 'deployment') -ne "/root/ai-life-sim-backups/$commit-$deployRunId" -or
        (Get-UniqueStateField $stateText 'archive_sha256' 'deployment') -ne $archiveHash -or
        (Get-UniqueStateField $stateText 'persistence_migration' 'deployment') -ne $plannedPersistenceMigration -or
        (Get-UniqueStateField $stateText 'recovery_sha256' 'deployment') -ne $recoveryScriptHash) {
      throw 'deployment state identity does not match the locked plan; do not retry'
    }
    if ($deploymentStatus -notin @('DEPLOY_OK', 'NOOP')) {
      throw "remote deployment ended as $deploymentStatus (exit $deployCode); follow the documented handling for that exact state"
    }
    if ($deployCode -ne 0) {
      Write-Host "SSH returned $deployCode, but the lock-owned state confirms $deploymentStatus."
    }
    $deploymentSucceeded = $true
  } finally {
    if (-not $remoteExecutionStarted) {
      & ssh tencent-vm (
        "rm -f -- '$remoteArchiveUpload' '$remoteScriptUpload' '$remoteRecoveryUpload'; " +
        "sudo rm -f -- '$remoteArchive' '$remoteScript' '$remoteRecoveryScript'"
      ) 2>$null
    }
    foreach ($path in @($archive, $deployScriptSnapshot, $recoveryScriptSnapshot)) {
      if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    }
    if ($deploymentSucceeded -and (Test-Path -LiteralPath $PlanPath)) {
      Remove-Item -LiteralPath $PlanPath -Force
    }
  }
}
