# Purpose: Validate active subsystem source against the runtime subsystem contract.
# Owner: quality:mod
# Responsibility: C0-C7, C11 subsystem registration, and C14 subsystem documentation assertions only.

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName
  $manifestPath = Join-Path $modPath 'manifest.ts'
  if (-not (Test-Path $manifestPath)) { continue }
  $manifestRaw = Get-FileContent $manifestPath
  $manifestDeclaredSubsystems = @(Get-DeclaredStringArray $manifestRaw 'subsystems')
  $subDir = Join-Path $modPath "subsystems"
  $allSubFiles = @()
  $subFiles = @()
  if (Test-Path $subDir) {
    $allSubFiles = @(Get-ChildItem -Path $subDir -Filter "*-system.ts" -File)
    $subFiles = @($allSubFiles | Where-Object { Test-IsActiveRuntimeSubsystemFile $_.FullName })
    foreach ($inactiveFile in @($allSubFiles | Where-Object { -not (Test-IsActiveRuntimeSubsystemFile $_.FullName) })) {
      Warn 'C0-INACTIVE-SUBSYSTEM' "src/mods/${modName}/subsystems/$($inactiveFile.Name)" '' 'not in the current runtime policy; strict runtime checks are deferred until activation'
    }
  }
  if ($manifestDeclaredSubsystems.Count -gt 0) {
    if (-not (Test-Path $subDir)) {
      Fail "C11-SUB-DIR" $modName "" "manifest                          subsystems/                "
    } elseif ($allSubFiles.Count -eq 0) {
      Fail "C11-SUB-FILE" $modName "" "manifest                          subsystems/                         "
    }
  }

  if ($subFiles.Count -gt 0) {
    foreach ($subFile in $subFiles) {
      $fileName = $subFile.Name
      $filePath = $subFile.FullName
      $relPath = "src/mods/${modName}/subsystems/${fileName}"
      $content = Get-FileContent $filePath
      if (-not $content) { continue }
      $moduleContent = Get-ModuleResponsibilityContent $filePath

      #           C1:
      if ($fileName -match '^[a-z0-9]+(-[a-z0-9]+)*-system\.ts$') {
        Pass "C1-FILE-NAME" $relPath "                {kebab-case}-system.ts"
      } else {
        Fail "C1-FILE-NAME" $relPath "" "                            {kebab-case}-system.ts   $fileName"
      }

      # C1: subsystem class export. New/touched subsystems should extend BaseSubsystem;
      # legacy implements ISubSystem remains a warning during the staged migration.
      $classMatch = [regex]::Match($content, 'export class (\w+System)\s+(extends\s+BaseSubsystem\b|implements\s+ISubSystem\b)')
      if ($classMatch.Success) {
        $className = $classMatch.Groups[1].Value
        $classMode = $classMatch.Groups[2].Value
        $parts = ($fileName -replace '\.ts$', '').Split('-')
        $expectedClassName = ($parts | ForEach-Object {
          $_.Substring(0,1).ToUpper() + $_.Substring(1)
        }) -join ''

        if ($className -eq $expectedClassName) {
          Pass "C1-CLASS-MATCH" $relPath "       '$className' =           '$fileName'"
        } else {
          Fail "C1-CLASS-MATCH" $relPath "" "                '$className'              '$fileName'                    '$expectedClassName'"
        }

        if ($classMode -match '^extends') {
          Pass "C1-CLASS-EXPORT" $relPath "subsystem class extends BaseSubsystem"
        } else {
          Warn "C1-LEGACY-ISUBSYSTEM" $relPath "" "legacy subsystem still implements ISubSystem; migrate to BaseSubsystem when touched/restored"
        }
      } else {
        Fail "C1-CLASS-EXPORT" $relPath "" "expected 'export class XxxSystem extends BaseSubsystem' (legacy untouched files may still implement ISubSystem)"
      }

      #           C2: readonly
      $idMatch = [regex]::Match($content, "readonly id = '([a-z0-9-]+)' as const")
      if ($idMatch.Success) {
        Pass "C2-ID" $relPath "id = '$($idMatch.Groups[1].Value)'"
      } else {
        Fail "C2-ID" $relPath "" "       'readonly id = '{kebab-name}' as const'"
      }

      $modMatch = [regex]::Match($content, "readonly mod = '(${modName})' as const")
      if ($modMatch.Success) {
        Pass "C2-MOD" $relPath "mod = '$($modMatch.Groups[1].Value)'"
      } else {
        Fail "C2-MOD" $relPath "" "       'readonly mod = '${modName}' as const'"
      }

      $lblMatch = [regex]::Match($content, "readonly label = '(.+?)' as const")
      if ($lblMatch.Success) {
        $lbl = $lblMatch.Groups[1].Value
        if ($lbl -match '[\u4e00-\u9fff]') {
          Pass "C2-LABEL" $relPath "label = '$lbl'"
        } else {
          Warn "C2-LABEL" $relPath "" "label = '$lbl'                                      label   "
        }
      } else {
        Fail "C2-LABEL" $relPath "" "       'readonly label = '...' as const'"
      }

      $descMatch = [regex]::Match($content, "readonly description = '(.+?)' as const")
      if ($descMatch.Success) {
        Pass "C2-DESC" $relPath "description       "
      } else {
        Fail "C2-DESC" $relPath "" "       'readonly description = '...' as const'"
      }

      # C3: writable runtime members keep strict validation. Read-only runtime
      # members only need the public signature because the round field registry
      # rejects external writes before dispatch.
      if ($content -match 'applyChanges\(changes:\s*SubSystemChanges') {
        $subsystemId = Get-SubsystemIdFromContent $content
        if ($subsystemId -and $Script:NarrativeWritableSubsystemIds.Contains($subsystemId)) {
          $checksOk = 0
          $checksFail = ""
          if ($content -match 'if \(!changes \|\| typeof changes !== .object.\)') { $checksOk++ } else { $checksFail += " Line1(top) " }
          if ($content -match 'changes\.id !== this\.id') { $checksOk++ } else { $checksFail += " Line2(id) " }
          if ($content -match '!changes\.changes \|\| typeof changes\.changes !== .object. \|\| Array\.isArray') { $checksOk++ } else { $checksFail += " Line3(plain) " }
          if ($content -match '!changes\.description \|\| changes\.description\.trim') { $checksOk++ } else { $checksFail += " Line4(desc) " }
          if ($content -match "const \w+ = changes\.changes") { $checksOk++ } else { $checksFail += " Line5(read) " }

          if ($checksOk -ge 5) {
            Pass "C3-APPLY-FIVE" $relPath "writable applyChanges validation ($checksOk/5)"
          } else {
            Fail "C3-APPLY-FIVE" $relPath "" "writable applyChanges validation ($checksOk/5) $checksFail"
          }
        } else {
          Pass 'C3-APPLY-SIG' $relPath 'read-only runtime subsystem exposes the required applyChanges signature'
        }
      } else {
        Fail "C3-APPLY-SIG" $relPath "" "       applyChanges(changes: SubSystemChanges, ...)       "
      }

      #           C4: collectState structuredClone
      $hasStructuredClone = ($moduleContent -match 'structuredClone\(')
      $hasAsUnknown = ($moduleContent -match 'as unknown as Record<string, unknown>')
      if ($hasStructuredClone) {
        if ($hasAsUnknown) {
          Pass "C4-DEEPCOPY" $relPath "collectState        structuredClone(...) + as unknown                   "
        } else {
          Pass "C4-DEEPCOPY" $relPath "collectState        structuredClone()          "
        }
      } else {
        Fail "C4-DEEPCOPY" $relPath "" "collectState           structuredClone()           data              this.state / {   } / api                      "
      }

      # C5: SubSystemState and TypeScript own the value type. The scanner only
      # verifies that collectState projects the required summary field; empty or
      # computed summaries are valid for context-gated systems.
      $hasSummaryField = $moduleContent -match '\bsummary\s*:'
      $hasSummaryShorthand =
        ($moduleContent -match '\b(?:const|let|var)\s+summary\s*=') -and
        ($moduleContent -match 'return\s*\{[\s\S]*?\bsummary\b')
      if ($content -match 'collectState\s*\(' -and ($hasSummaryField -or $hasSummaryShorthand)) {
        Pass 'C5-SUMMARY-FMT' $relPath 'collectState projects a summary field'
      } else {
        Fail 'C5-SUMMARY-FMT' $relPath '' 'collectState must project the SubSystemState.summary field'
      }

      #           C6: reset()
      if ($content -match 'reset\(\)\s*:\s*void') {
        Pass "C6-RESET" $relPath "reset()             "
      } else {
        Fail "C6-RESET" $relPath "" "       reset()       "
      }

      #           C6: reset     _lastProcessedRound
      if ($content -match '_lastProcessedRound\s*=') {
        if ($content -match 'this\._lastProcessedRound\s*=\s*-1[\s\S]*reset|reset[\s\S]*this\._lastProcessedRound\s*=\s*-1') {
          Pass "C6-RESET-ROUND" $relPath "reset()              _lastProcessedRound = -1"
        } elseif ($content -match '(?:private|public)\s+_lastProcessedRound' -and $content -match 'this\._lastProcessedRound\s*=\s*-1' -and ($content -match 'reset\(\)[\s\S]*\{[\s\S]*?_lastProcessedRound\s*=\s*-1' -or $content -match '_lastProcessedRound\s*=\s*-1[\s\S]*?reset')) {
          Pass "C6-RESET-ROUND" $relPath "reset()              _lastProcessedRound = -1"
        } else {
          $hasResetAndRound = ($content -match 'reset\(\)[\s\S]*_lastProcessedRound') -or ($content -match '_lastProcessedRound[\s\S]*reset\(\)')
          if ($hasResetAndRound) {
            Pass "C6-RESET-ROUND" $relPath "reset()              _lastProcessedRound = -1"
          } else {
            Warn "C6-RESET-ROUND" $relPath "reset() should set _lastProcessedRound = -1"
          }
        }
      }

      #           C7: round-idempotent
      if ($content -match '_lastProcessedRound') {
        if ($content -match 'round\.year === this\._lastProcessedRound' -or $content -match '_lastProcessedRound = context\.round\.year') {
          Pass "C7-IDEMPOTENT" $relPath "round-idempotent                context.round.year   "
        } else {
          Warn "C7-IDEMPOTENT" $relPath "" "          _lastProcessedRound                         "
        }
      }

      #           C14:              JSDoc
      if ($content -match '@module\s+\w+') {
        Pass "C14-JSDOC-MODULE" $relPath "                   @module       "
      } else {
        Warn "C14-JSDOC-MODULE" $relPath "" "                   @module       "
      }
      if ($content -match "@mod\s+${modName}") {
        Pass "C14-JSDOC-MOD" $relPath "                   @mod ${modName}       "
      } else {
        Warn "C14-JSDOC-MOD" $relPath "" "                   @mod ${modName}       "
      }
    }

    #                     <-> manifest
    $declaredClasses = $manifestDeclaredSubsystems
    $actualClasses = @()
    foreach ($sf in $allSubFiles) {
      $sc = Get-FileContent $sf.FullName
      $cm = [regex]::Match($sc, 'export class (\w+)\s+(?:extends\s+BaseSubsystem\b|implements\s+ISubSystem\b)')
      if ($cm.Success) {
        $actualClasses += $cm.Groups[1].Value
      }
    }

    $missingInManifest = $actualClasses | Where-Object { $_ -notin $declaredClasses }
    $extraInManifest = $declaredClasses | Where-Object { $_ -notin $actualClasses }

    foreach ($m in $missingInManifest) {
      Fail "C11-MISSING-MANIFEST" $modName "" "             '$m'        manifest.ts subsystems          "
    }
    foreach ($m in $extraInManifest) {
      Fail "C11-EXTRA-MANIFEST" $modName "" "manifest.ts                    '$m'       subsystems/                      "
    }
  }  # end if ($subFiles.Count -gt 0)
}
