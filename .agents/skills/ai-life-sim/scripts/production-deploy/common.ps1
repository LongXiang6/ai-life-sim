# Purpose: Provide local native-process, Git, hashing, and Node runtime prerequisites for deployment.
# Owner: project-skill:ai-life-sim
# Responsibility: Local prerequisite resolution only; no production mutation or mode dispatch.

function Invoke-NativeChecked {
  param(
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][scriptblock]$Command
  )

  & $Command
  $code = $LASTEXITCODE
  if ($code -ne 0) { throw "$Label failed with exit code $code" }
}

function Get-NativeText {
  param(
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][scriptblock]$Command
  )

  $output = & $Command
  $code = $LASTEXITCODE
  if ($code -ne 0) { throw "$Label failed with exit code $code" }
  return (($output | Out-String).Trim())
}

function Get-NativeLines {
  param(
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][scriptblock]$Command
  )

  $output = @(& $Command)
  $code = $LASTEXITCODE
  if ($code -ne 0) { throw "$Label failed with exit code $code" }
  return @($output | ForEach-Object { [string]$_ })
}

function Get-BytesSha256 {
  param([Parameter(Mandatory)][byte[]]$Bytes)

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $digest = $sha256.ComputeHash($Bytes)
  } finally {
    $sha256.Dispose()
  }
  return ([System.BitConverter]::ToString($digest).Replace('-', '').ToLowerInvariant())
}

function Assert-NoForbiddenTrackedSecretPaths {
  param(
    [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Paths,
    [Parameter(Mandatory)][string]$Context
  )

  $forbidden = @($Paths | Where-Object {
    $name = $_.Replace('\', '/')
    (($name -match '(^|/)\.env(\.|$)') -and $name -notmatch '(^|/)\.env\.example$') -or
      $name -match '\.(pem|key|p12|pfx)$'
  })
  if ($forbidden.Count -gt 0) {
    throw "$Context contains forbidden tracked secret filenames: $($forbidden -join ', ')"
  }
}

function Test-GitAncestor {
  param([string]$Ancestor, [string]$Descendant)

  & git merge-base --is-ancestor $Ancestor $Descendant
  $code = $LASTEXITCODE
  if ($code -eq 0) { return $true }
  if ($code -eq 1) { return $false }
  throw "git merge-base failed with exit code $code"
}

function Sync-OriginMainRef {
  param([Parameter(Mandatory)][string]$Label)

  $gh = Get-Command gh -CommandType Application -ErrorAction SilentlyContinue
  if ($gh) {
    $remoteSha = ((& $gh.Source api repos/LongXiang6/ai-life-sim/git/ref/heads/main --jq '.object.sha' 2>$null) | Out-String).Trim()
    $ghCode = $LASTEXITCODE
    if ($ghCode -eq 0 -and $remoteSha -match '^[0-9a-f]{40}$') {
      & git cat-file -e "$remoteSha^{commit}" 2>$null
      if ($LASTEXITCODE -eq 0) {
        Invoke-NativeChecked "$Label (GitHub API ref)" {
          git update-ref refs/remotes/origin/main $remoteSha
        }
        return
      }
    }
  }

  Invoke-NativeChecked $Label {
    git fetch --prune origin '+refs/heads/main:refs/remotes/origin/main'
  }
}

function Get-ProductionDiffSha256 {
  param(
    [Parameter(Mandatory)][string]$FromCommit,
    [Parameter(Mandatory)][string]$ToCommit,
    [Parameter(Mandatory)][string]$RunId
  )

  $diffPath = Join-Path ([System.IO.Path]::GetTempPath()) "ai-life-sim-production-diff-$RunId.patch"
  if (Test-Path -LiteralPath $diffPath) {
    throw "production diff snapshot path already exists: $diffPath"
  }
  try {
    Invoke-NativeChecked 'create production diff snapshot' {
      git --no-pager diff --binary --full-index --no-ext-diff --no-textconv `
        --find-renames --output=$diffPath $FromCommit $ToCommit
    }
    $diffBytes = [System.IO.File]::ReadAllBytes($diffPath)
    return Get-BytesSha256 $diffBytes
  } finally {
    if (Test-Path -LiteralPath $diffPath) {
      Remove-Item -LiteralPath $diffPath -Force
    }
  }
}

function Assert-Node20 {
  param([Parameter(Mandatory)][string]$NodePath)

  $major = Get-NativeText 'resolve local Node major version' {
    & $NodePath -p 'process.versions.node.split(".")[0]'
  }
  if ($major -ne '20') {
    throw "formal deployment requires local Node 20, found major version $major"
  }
}

function Resolve-Node20Runtime {
  $candidates = @(Get-Command node -CommandType Application -All -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Source -Unique)
  foreach ($nodePath in $candidates) {
    $nodeDirectory = Split-Path -Parent $nodePath
    $npmPath = Join-Path $nodeDirectory 'npm.cmd'
    if (-not (Test-Path -LiteralPath $npmPath -PathType Leaf)) { continue }

    $major = & $nodePath -p 'process.versions.node.split(".")[0]' 2>$null
    $code = $LASTEXITCODE
    if ($code -eq 0 -and (($major | Out-String).Trim()) -eq '20') {
      return [pscustomobject]@{
        Node = $nodePath
        Npm = $npmPath
        Bin = $nodeDirectory
        Source = 'installed'
      }
    }
  }

  $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
  if (-not $localAppData) {
    throw 'cannot resolve the local application data directory for the deployment Node runtime'
  }
  $archiveName = "node-v$LocalNodeVersion-win-x64.zip"
  $runtimeRoot = Join-Path $localAppData 'ai-life-sim-deploy\runtimes'
  $runtimePath = Join-Path $runtimeRoot "node-v$LocalNodeVersion-win-x64-$($LocalNodeArchiveSha256.Substring(0, 12))"
  $runtimeNode = Join-Path $runtimePath 'node.exe'
  $runtimeNpm = Join-Path $runtimePath 'npm.cmd'

  if (Test-Path -LiteralPath $runtimePath) {
    if (-not (Test-Path -LiteralPath $runtimeNode -PathType Leaf) -or
        -not (Test-Path -LiteralPath $runtimeNpm -PathType Leaf)) {
      throw "cached deployment Node runtime is incomplete: $runtimePath"
    }
    $cachedVersion = Get-NativeText 'verify cached deployment Node runtime' {
      & $runtimeNode -p 'process.versions.node'
    }
    if ($cachedVersion -ne $LocalNodeVersion) {
      throw "cached deployment Node runtime has unexpected version: $runtimePath"
    }
    return [pscustomobject]@{
      Node = $runtimeNode
      Npm = $runtimeNpm
      Bin = $runtimePath
      Source = 'verified-cache'
    }
  }

  [System.IO.Directory]::CreateDirectory($runtimeRoot) | Out-Null
  $downloadId = [guid]::NewGuid().ToString('N')
  $archivePath = Join-Path $runtimeRoot "$downloadId-$archiveName"
  $extractPath = Join-Path $runtimeRoot ".extract-$downloadId"
  $downloadUrl = "https://nodejs.org/dist/v$LocalNodeVersion/$archiveName"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $archivePath
    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($archiveHash -ne $LocalNodeArchiveSha256) {
      throw "official Node archive hash mismatch for $downloadUrl"
    }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath
    $extractedRuntime = Join-Path $extractPath "node-v$LocalNodeVersion-win-x64"
    if (-not (Test-Path -LiteralPath (Join-Path $extractedRuntime 'node.exe') -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $extractedRuntime 'npm.cmd') -PathType Leaf)) {
      throw 'official Node archive does not contain the expected Windows runtime'
    }
    if (Test-Path -LiteralPath $runtimePath) {
      throw "deployment Node cache path appeared concurrently; rerun after inspecting it: $runtimePath"
    }
    Move-Item -LiteralPath $extractedRuntime -Destination $runtimePath
  } finally {
    if (Test-Path -LiteralPath $archivePath) {
      Remove-Item -LiteralPath $archivePath -Force
    }
    if (Test-Path -LiteralPath $extractPath) {
      [System.IO.Directory]::Delete($extractPath, $true)
    }
  }

  $downloadedVersion = Get-NativeText 'verify downloaded deployment Node runtime' {
    & $runtimeNode -p 'process.versions.node'
  }
  if ($downloadedVersion -ne $LocalNodeVersion) {
    throw 'downloaded deployment Node runtime has an unexpected version'
  }
  return [pscustomobject]@{
    Node = $runtimeNode
    Npm = $runtimeNpm
    Bin = $runtimePath
    Source = 'verified-download'
  }
}
