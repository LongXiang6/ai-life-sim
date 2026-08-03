# Purpose: Validate locked deployment state fields, Skill assets, SSH target identity, and persistence layout.
# Owner: project-skill:ai-life-sim
# Responsibility: Read-only production target and deployment-state validation only.

function Get-UniqueStateField {
  param(
    [Parameter(Mandatory)][string]$StateText,
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Context
  )

  $fieldMatches = [regex]::Matches(
    $StateText,
    "(?m)^$([regex]::Escape($Name))=([^`r`n]*)$"
  )
  if ($fieldMatches.Count -ne 1) {
    throw "$Context state has invalid $Name"
  }
  return $fieldMatches[0].Groups[1].Value
}

function Assert-SkillScripts {
  foreach ($path in @($DeployRemoteScriptPath, $RecoveryRemoteScriptPath, $DriverScriptPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "required deployment skill script is missing: $path"
    }
  }
}

function Assert-DeploymentTargets {
  $fetchUrl = Get-NativeText 'resolve origin fetch URL' { git remote get-url origin }
  $pushUrl = Get-NativeText 'resolve origin push URL' { git remote get-url --push origin }
  if ($fetchUrl -ne $ExpectedOriginUrl -or $pushUrl -ne $ExpectedOriginUrl) {
    throw 'origin does not resolve to the expected ai-life-sim repository'
  }

  $sshConfigLines = Get-NativeLines 'resolve production SSH alias' { ssh -G tencent-vm }
  $expectedSettings = [ordered]@{
    hostname = $ExpectedSshHost
    user = $ExpectedSshUser
    port = $ExpectedSshPort
  }
  foreach ($entry in $expectedSettings.GetEnumerator()) {
    $values = @($sshConfigLines | ForEach-Object {
      if ($_ -match "^$([regex]::Escape($entry.Key))\s+(.+)$") { $Matches[1].Trim() }
    })
    if ($values.Count -ne 1 -or $values[0] -ne $entry.Value) {
      throw "production SSH alias has unexpected $($entry.Key)"
    }
  }
  $identityFiles = @($sshConfigLines | ForEach-Object {
    if ($_ -match '^identityfile\s+(.+)$') { $Matches[1].Trim() }
  })
  $expectedIdentity = [System.IO.Path]::GetFullPath($ExpectedSshIdentityFile)
  $matchingIdentity = @($identityFiles | Where-Object {
    try {
      [System.IO.Path]::GetFullPath($_).Equals(
        $expectedIdentity,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    } catch {
      $false
    }
  })
  if ($matchingIdentity.Count -ne 1 -or
      -not (Test-Path -LiteralPath $expectedIdentity -PathType Leaf)) {
    throw 'production SSH alias does not use the expected identity file'
  }
  $strictHostKeyChecking = @($sshConfigLines | ForEach-Object {
    if ($_ -match '^stricthostkeychecking\s+(.+)$') { $Matches[1].Trim() }
  })
  if ($strictHostKeyChecking.Count -ne 1 -or
      $strictHostKeyChecking[0] -notin @('yes', 'accept-new')) {
    throw 'production SSH host key checking is not enabled'
  }

  $knownHosts = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.ssh\known_hosts'
  if (-not (Test-Path -LiteralPath $knownHosts -PathType Leaf)) {
    throw 'SSH known_hosts is missing for the production target'
  }
  $knownHostFingerprints = Get-NativeLines 'verify production SSH host fingerprint' {
    ssh-keygen -lf $knownHosts
  }
  $fingerprintPattern = (
    [regex]::Escape($ExpectedSshHostFingerprint) + '\s+' +
    [regex]::Escape($ExpectedSshHost) + '\s+\(ED25519\)$'
  )
  $expectedFingerprintLine = @($knownHostFingerprints | Where-Object {
    $_ -match $fingerprintPattern
  })
  if ($expectedFingerprintLine.Count -ne 1) {
    throw 'the pinned production ED25519 host fingerprint is missing from known_hosts'
  }
}

function Assert-ProductionPersistenceLayout {
  param([Parameter(Mandatory)][string]$ActiveRelease)

  $requiredSettings = [ordered]@{
    NARRATIVE_MEMORY_DIR = '/var/lib/ai-life-sim/narrative-memory'
    NARRATIVE_ROUND_LOG_DIR = '/var/log/ai-life-sim/narrative-rounds'
  }
  $invalidSettings = @()
  foreach ($entry in $requiredSettings.GetEnumerator()) {
    $keyLines = @(& ssh tencent-vm "sudo grep -E '^$($entry.Key)=' '$ActiveRelease/.env.production.local'")
    $keyCode = $LASTEXITCODE
    if ($keyCode -notin @(0, 1)) {
      throw "production persistence key check failed for $($entry.Key) with exit code $keyCode"
    }
    $expectedLines = @(& ssh tencent-vm "sudo grep -Fx '$($entry.Key)=$($entry.Value)' '$ActiveRelease/.env.production.local'")
    $expectedCode = $LASTEXITCODE
    if ($expectedCode -notin @(0, 1)) {
      throw "production persistence value check failed for $($entry.Key) with exit code $expectedCode"
    }
    if ($keyLines.Count -eq 0) {
      $invalidSettings += "$($entry.Key):missing"
    } elseif ($keyLines.Count -ne 1 -or $expectedLines.Count -ne 1) {
      $invalidSettings += "$($entry.Key):duplicate-or-wrong"
    }
  }
  if ($invalidSettings.Count -gt 0) {
    throw "production persistence settings are not uniquely externalized ($($invalidSettings -join ', ')); preserve the active release and complete a dedicated lossless migration before planning a deployment"
  }
  foreach ($path in $requiredSettings.Values) {
    $metadata = Get-NativeText "inspect production persistence directory $path" {
      ssh tencent-vm "sudo stat -c '%u:%a' '$path'"
    }
    if ($metadata -ne '0:700') {
      throw "production persistence directory must exist with root ownership and mode 0700: $path"
    }
  }
  foreach ($legacyPath in @(
      "$ActiveRelease/.data/narrative-memory",
      "$ActiveRelease/.data/narrative-rounds"
    )) {
    & ssh tencent-vm "sudo test -e '$legacyPath'"
    $existsCode = $LASTEXITCODE
    if ($existsCode -eq 1) { continue }
    if ($existsCode -ne 0) {
      throw "production legacy persistence path check failed with exit code $existsCode"
    }
    & ssh tencent-vm "sudo test -L '$legacyPath'"
    $symlinkCode = $LASTEXITCODE
    if ($symlinkCode -eq 0) {
      throw "active release legacy persistence path must not be a symlink: $legacyPath"
    }
    if ($symlinkCode -ne 1) {
      throw "production legacy persistence symlink check failed with exit code $symlinkCode"
    }
    Invoke-NativeChecked 'verify legacy persistence path type' {
      ssh tencent-vm "sudo test -d '$legacyPath'"
    }
    $legacyEntry = Get-NativeText 'inspect legacy persistence path contents' {
      ssh tencent-vm "sudo find '$legacyPath' -mindepth 1 -print -quit"
    }
    if ($legacyEntry) {
      throw "active release still contains legacy persistence data at $legacyPath; preserve it and complete a dedicated verified migration before planning a deployment"
    }
  }
}
