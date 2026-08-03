# Purpose: Validate one MOD root and Manifest declaration contract.
# Owner: quality:mod
# Responsibility: C11, C12, and D4 root naming, required file, field, and event assertions only.

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName
  Write-Host "--- MOD: $modName ---" -ForegroundColor Cyan

  #           C11: MOD
  if ($modName -match '^mod-[a-z0-9]+(-[a-z0-9]+)*$') {
    Pass "C11-DIR" $modName "                   mod-{kebab-case}"
  } else {
    Fail "C11-DIR" $modName "" "MOD                    mod-{kebab-case}"
  }

  #                  manifest
  $manifestPath = Join-Path $modPath "manifest.ts"
  if (-not (Test-Path $manifestPath)) {
    Fail "C12-MANIFEST" $modName "" "       manifest.ts"
    continue
  }
  $manifestRaw = Get-FileContent $manifestPath
  $manifestDeclaredSubsystems = @()
  $manifestDeclaredSubsystems = @(Get-DeclaredStringArray $manifestRaw 'subsystems')

  #           C12: manifest
  $namePattern = [regex]::Escape($modName)
  if ($manifestRaw -notmatch "name:\s*'$namePattern'") {
    Fail "C12-MANIFEST-FIELD" $modName "" "manifest.ts     name                                      '$modName'"
  }
  if ($manifestRaw -notmatch "version:\s*'\d+\.\d+\.\d+'") {
    Fail "C12-MANIFEST-FIELD" $modName "" "manifest.ts                 version          semver   "
  }
  if ($manifestRaw -notmatch "description:\s*'.+") {
    Fail "C12-MANIFEST-FIELD" $modName "" "manifest.ts        description       "
  }
  if ($manifestRaw -notmatch "dependencies:\s*\[") {
    Fail "C12-MANIFEST-FIELD" $modName "" "manifest.ts        dependencies       "
  }
  if ($manifestRaw -notmatch "provides:\s*\[") {
    Fail "C12-MANIFEST-FIELD" $modName "" "manifest.ts        provides       "
  }
  if ($manifestRaw -notmatch "consumes:\s*\[") {
    Fail "C12-MANIFEST-FIELD" $modName "" "manifest.ts        consumes       "
  }

  #           C12: events
  $emits = @(Get-DeclaredStringArray $manifestRaw 'emits')
  if ($emits.Count -gt 0) {
    foreach ($evt in $emits) {
      $evtFmt = "^" + [regex]::Escape($modName) + ":[a-z]+-[a-z-]+$"
      if (-not [regex]::IsMatch($evt, $evtFmt)) {
        Warn "C12-EVENT-FMT" $modName "" "                        '$evt'          '{mod}:{verb}-{noun}'"
      }
    }
  }
  $listens = @(Get-DeclaredStringArray $manifestRaw 'listens')
  if ($listens.Count -gt 0) {
    foreach ($evt in $listens) {
      if ($evt -notmatch '^mod-[a-z-]+:[a-z]+-[a-z-]+$') {
        Warn "C12-EVENT-FMT" $modName "" "                              '$evt'          '{mod}:{verb}-{noun}'"
      }
    }
  }

  #           D4: MOD
  $requiredFiles = @("manifest.ts", "types.ts", "index.ts")
  foreach ($rf in $requiredFiles) {
    $rfPath = Join-Path $modPath $rf
    if (-not (Test-Path $rfPath)) {
      Fail "D4-REQUIRED-FILE" $modName "" "                     $rf"
    } else {
      Pass "D4-REQUIRED-FILE" $modName "$rf       "
    }
  }
}
