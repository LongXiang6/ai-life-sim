# Purpose: Build one immutable production deployment plan from the reviewed candidate state.
# Owner: project-skill:ai-life-sim
# Responsibility: Plan-mode validation and plan artifact creation only.

function Invoke-Plan {
  if ($PlanSha256 -or $ReviewedDiffSha256 -or
      $ConfirmNoProductionPersistenceChange -or $InterruptedRunId) {
    throw 'plan mode only accepts -PublishLocalHead, one optional persistence migration, and optional -PlanPath'
  }
  $selectedPlanMigrations = @()
  if ($PlayerMailboxV5Migration) { $selectedPlanMigrations += 'player-mailbox-v5' }
  if ($GameRecordLifespanAdjustmentMigration) { $selectedPlanMigrations += 'game-record-lifespan-adjustments' }
  if ($LogArchiveV1Migration) { $selectedPlanMigrations += 'log-archive-v1' }
  if ($selectedPlanMigrations.Count -gt 1) {
    throw 'plan mode accepts at most one persistence migration'
  }

  Assert-SkillScripts
  Set-Location $Repo
  Assert-DeploymentTargets

  $driverBytes = [System.IO.File]::ReadAllBytes($DriverScriptPath)
  $deployRemoteBytes = [System.IO.File]::ReadAllBytes($DeployRemoteScriptPath)
  $recoveryRemoteBytes = [System.IO.File]::ReadAllBytes($RecoveryRemoteScriptPath)

  Invoke-NativeChecked 'workspace status' { git -C $Workspace status --short }
  Invoke-NativeChecked 'workspace unstaged paths' { git -C $Workspace --no-pager diff --name-status }
  Invoke-NativeChecked 'workspace staged paths' { git -C $Workspace --no-pager diff --cached --name-status }
  Invoke-NativeChecked 'project status' { git status --short }
  Invoke-NativeChecked 'project unstaged paths' { git --no-pager diff --name-status }
  Invoke-NativeChecked 'project staged paths' { git --no-pager diff --cached --name-status }
  Sync-OriginMainRef -Label 'fetch origin/main'
  $originBefore = Get-NativeText 'resolve origin/main' {
    git rev-parse --verify 'refs/remotes/origin/main^{commit}'
  }

  if ($PublishLocalHead) {
    $branch = Get-NativeText 'resolve current branch' { git branch --show-current }
    if ($branch -ne 'main') { throw 'local release changes must be closed on main' }

    $head = Get-NativeText 'resolve local HEAD' { git rev-parse --verify 'HEAD^{commit}' }
    $headIsAncestor = Test-GitAncestor $head $originBefore
    $originIsAncestor = Test-GitAncestor $originBefore $head
    if (-not $headIsAncestor -and -not $originIsAncestor) {
      throw 'local main and origin/main diverged; deployment must not merge or rebase implicitly'
    }
    if ($head -ne $originBefore -and $headIsAncestor) {
      Invoke-NativeChecked 'fast-forward local main' { git merge --ff-only $originBefore }
      $head = Get-NativeText 'resolve fast-forwarded HEAD' {
        git rev-parse --verify 'HEAD^{commit}'
      }
    }
    if (-not (Test-GitAncestor $originBefore $head)) {
      throw 'local HEAD is not a forward candidate from origin/main'
    }

    $commit = $head
    $needsPush = $commit -ne $originBefore
    Invoke-NativeChecked 'review unpublished candidate commits' {
      git --no-pager log --oneline --decorate "$originBefore..$commit"
    }
    Invoke-NativeChecked 'review unpublished candidate paths' {
      git --no-pager diff --name-status $originBefore $commit
    }
  } else {
    $commit = $originBefore
    $needsPush = $false
  }

  if ($commit -notmatch '^[0-9a-f]{40}$') {
    throw 'candidate commit must be a full 40-character hash'
  }

  $activeRelease = Get-NativeText 'resolve active production release' {
    ssh tencent-vm 'sudo readlink -f /root/ai-life-sim'
  }
  if ($activeRelease -notmatch '^/root/ai-life-sim-releases/(?<id>[0-9a-f]{7}|[0-9a-f]{40})$') {
    throw "unexpected active release path: $activeRelease"
  }
  $activeId = $Matches.id
  Assert-ProductionPersistenceLayout $activeRelease
  $activeCommit = if ($activeId.Length -eq 40) {
    $activeId
  } else {
    Get-NativeText 'resolve legacy active commit' {
      git rev-parse --verify "$activeId^{commit}"
    }
  }
  if (-not (Test-GitAncestor $activeCommit $commit)) {
    throw 'normal deployment cannot downgrade or cross a divergent production commit'
  }

  $trackedNames = Get-NativeLines 'list candidate files before content review' {
    git ls-tree -r --name-only $commit
  }
  Assert-NoForbiddenTrackedSecretPaths -Paths $trackedNames -Context 'candidate'
  $changedPaths = Get-NativeLines 'collect production changed paths' {
    git --no-pager diff --name-only $activeCommit $commit
  }
  Assert-NoForbiddenTrackedSecretPaths -Paths $changedPaths -Context 'production delta'
  $deployRunId = [guid]::NewGuid().ToString('N')
  $productionDiffSha256 = Get-ProductionDiffSha256 `
    -FromCommit $activeCommit `
    -ToCommit $commit `
    -RunId $deployRunId

  Write-Host '=== Production commits ==='
  Invoke-NativeChecked 'review production commits' {
    git --no-pager log --oneline --decorate "$activeCommit..$commit"
  }
  Write-Host '=== Production diff stat ==='
  Invoke-NativeChecked 'review production diff stat' {
    git --no-pager diff --stat $activeCommit $commit
  }
  Write-Host '=== Production changed paths ==='
  $changedPaths | ForEach-Object { Write-Host $_ }
  Write-Host '=== Production content diff ==='
  Invoke-NativeChecked 'review production content diff' {
    git --no-pager diff --binary --full-index --no-ext-diff --no-textconv `
      --find-renames $activeCommit $commit
  }

  $outputPlanPath = if ($PlanPath) {
    [System.IO.Path]::GetFullPath($PlanPath)
  } else {
    Join-Path ([System.IO.Path]::GetTempPath()) "ai-life-sim-deploy-plan-$deployRunId.json"
  }
  if (Test-Path -LiteralPath $outputPlanPath) {
    throw "deployment plan path already exists: $outputPlanPath"
  }

  $plan = [ordered]@{
    schemaVersion = 3
    createdAt = [DateTimeOffset]::Now.ToString('o')
    repo = $Repo
    commit = $commit
    originBefore = $originBefore
    needsPush = [bool]$needsPush
    activeRelease = $activeRelease
    activeCommit = $activeCommit
    deployRunId = $deployRunId
    changedPaths = @($changedPaths)
    productionDiffSha256 = $productionDiffSha256
    driverSha256 = Get-BytesSha256 $driverBytes
    deployRemoteSha256 = Get-BytesSha256 $deployRemoteBytes
    recoveryRemoteSha256 = Get-BytesSha256 $recoveryRemoteBytes
    persistenceMigration = if ($PlayerMailboxV5Migration) {
      'player-mailbox-v5'
    } elseif ($GameRecordLifespanAdjustmentMigration) {
      'game-record-lifespan-adjustments'
    } elseif ($LogArchiveV1Migration) {
      'log-archive-v1'
    } else {
      'none'
    }
  }
  $planJson = $plan | ConvertTo-Json -Depth 4
  $planBytes = [System.Text.UTF8Encoding]::new($false).GetBytes($planJson)
  [System.IO.File]::WriteAllBytes($outputPlanPath, $planBytes)
  $planHash = Get-BytesSha256 $planBytes

  Write-Host "PLAN_PATH=$outputPlanPath"
  Write-Host "PLAN_SHA256=$planHash"
  Write-Host "PRODUCTION_DIFF_SHA256=$productionDiffSha256"
  Write-Host 'STOP: review all commits, paths, content diff, and production persistence impact.'
  if ($PlayerMailboxV5Migration) {
    Write-Host 'MIGRATION=player-mailbox-v5: execute only after reviewing the dedicated apply and rollback archive contract.'
  } elseif ($GameRecordLifespanAdjustmentMigration) {
    Write-Host 'MIGRATION=game-record-lifespan-adjustments: execute only after reviewing the exact JSON-field rewrite and two-database rollback archive contract.'
  } elseif ($LogArchiveV1Migration) {
    Write-Host 'MIGRATION=log-archive-v1: execute only after reviewing the hot/archive copy verification and deployment-log rollback snapshots.'
  } else {
    Write-Host 'Execute only when the delta has no production Schema, migration, or rollback-compatibility impact.'
  }
}
