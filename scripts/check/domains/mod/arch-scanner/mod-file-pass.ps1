# Purpose: Run the single cached per-MOD architecture traversal.
# Owner: quality:mod
# Responsibility: File-local C, D, E, F, G, H, and P rule evaluation in one traversal only.

foreach ($md in $modDirs) {
  $mp = Join-Path $md.FullName "manifest.ts"
  if (Test-Path $mp) {
    $mr = Get-FileContent $mp
    $deps = @(Get-DeclaredStringArray $mr 'dependencies')
    $loMatch = [regex]::Match($mr, "loadOrder:\s*(\d+)")
    $lo = if ($loMatch.Success) { [int]$loMatch.Groups[1].Value } else { -1 }
    $nm = $md.Name
    $AllManifests[$nm] = @{ name=$nm; loadOrder=$lo; dependencies=$deps }
  }
}

#                                                                                                                                                                      
#              MOD
#                                                                                                                                                                      
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

  #                                                                                                                                                                      
  # E               
  #                                                                                                                                                                      
  #           E1: Prompt                          
  $promptsDir = Join-Path $modPath "prompts"
  if (Test-Path $promptsDir) {
    $promptFiles = Get-ChildItem -Path $promptsDir -Filter "*-prompt.ts" -File -ErrorAction SilentlyContinue
    foreach ($pf in $promptFiles) {
      $pc = Get-FileContent $pf.FullName
      if (-not $pc) { continue }
      $pfRel = "src/mods/${modName}/prompts/$($pf.Name)"
      $e1AllOk = $true
      $outputFormatMatch = [regex]::Match($pc, "outputFormat:\s*'(json|text|markdown)'")
      if (-not $outputFormatMatch.Success) {
        Fail "E1-PROMPT-FORMAT" $pfRel "" "Prompt              outputFormat   'json'|'text'|'markdown'   "
        $e1AllOk = $false
      }
      if ($outputFormatMatch.Success -and $outputFormatMatch.Groups[1].Value -eq 'json' -and $pc -notmatch 'outputSchema:') {
        Fail "E1-PROMPT-SCHEMA" $pfRel "" "Prompt              outputSchema   Zod          "
        $e1AllOk = $false
      }
      if ($pc -notmatch 'variables:\s*\[') {
        Warn "E1-PROMPT-VARS" $pfRel "" "Prompt              variables       "
      }
      if ($pc -notmatch "name:\s*'") {
        Fail "E1-PROMPT-NAME" $pfRel "" "Prompt              name       "
        $e1AllOk = $false
      }
      if ($pc -notmatch "version:\s*(?:'\d+\.\d+\.\d+'|[A-Z][A-Z0-9_]*)") {
        Fail "E1-PROMPT-VERSION" $pfRel "" "Prompt              version       "
        $e1AllOk = $false
      }
      if ($pc -notmatch 'systemPrompt:\s*') {
        Warn "E1-PROMPT-SYSTEM" $pfRel "" "Prompt              systemPrompt       "
      }
      if ($pc -notmatch 'userPromptTemplate:\s*') {
        Warn "E1-PROMPT-USER" $pfRel "" "Prompt              userPromptTemplate       "
      }
      #           E2: Prompt                       {{var}}                             
      $varMatch = [regex]::Match($pc, 'variables:\s*\[([\s\S]+?)\]')
      if ($varMatch.Success) {
        $declaredVars = ($varMatch.Groups[1].Value -replace "[\s']", "") -split ',' | Where-Object { $_ } | ForEach-Object { $_.Trim() }
        $templateStr = ""
        $tmplMatch = [regex]::Match($pc, "userPromptTemplate:\s*``([\s\S]*?)``")
        if (-not $tmplMatch.Success) {
          $tmplMatch = [regex]::Match($pc, "userPromptTemplate:\s*'([\s\S]*?)'")
        }
        if ($tmplMatch.Success) { $templateStr = $tmplMatch.Groups[1].Value }
        $usedVars = [regex]::Matches($templateStr, '\{\{(\w+)\}\}') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
        foreach ($dv in $declaredVars) {
          if ($dv -notin $usedVars) {
            Warn "E2-PROMPT-VAR-UNUSED" $pfRel "" "variables              '$dv'        userPromptTemplate          "
          }
        }
        foreach ($uv in $usedVars) {
          if ($uv -notin $declaredVars) {
            Fail "E2-PROMPT-VAR-UNDECLARED" $pfRel "" "userPromptTemplate              '{{$uv}}'           variables          "
          }
        }
      }
      if ($e1AllOk) {
        Pass "E1-PROMPT" $pfRel "Prompt                      outputFormat + JSON outputSchema + name + version   "
      }
    }
  }

  #                                                                                                                                                                      
  # P               
  #                                                                                                                                                                      
  #           P1: index.ts                          
  $indexPath = Join-Path $modPath "index.ts"
  if (Test-Path $indexPath) {
    $indexContent = Get-FileContent $indexPath

    #        types.ts                    index.ts     re-export
    $typesPath = Join-Path $modPath "types.ts"
    if (Test-Path $typesPath) {
      $typesContent = Get-FileContent $typesPath
      $typeExports = [regex]::Matches($typesContent, 'export (?:interface|type|enum) (\w+)')
      foreach ($te in $typeExports) {
        $tn = $te.Groups[1].Value
        if ($tn -match '(Props|Config|State|Internal)$') { continue }
        if ($indexContent -notmatch [regex]::Escape($tn)) {
          Warn "P1-INDEX-EXPORT" $modName "" "types.ts        '$tn'        index.ts     re-export"
        }
      }
    }

    #        hooks.ts       
    $hooksPath = Join-Path $modPath "hooks.ts"
    if (Test-Path $hooksPath) {
      $hooksContent = Get-FileContent $hooksPath
      $hookExports = [regex]::Matches($hooksContent, 'export (?:function|const) (use\w+)')
      foreach ($he in $hookExports) {
        $hn = $he.Groups[1].Value
        if ($indexContent -notmatch [regex]::Escape($hn)) {
          Warn "P1-INDEX-EXPORT" $modName "" "hooks.ts        '$hn'        index.ts          "
        }
      }
    }

    #        store.ts       
    $storeP1Path = Join-Path $modPath "store.ts"
    if (Test-Path $storeP1Path) {
      $storeP1Content = Get-FileContent $storeP1Path
      $storeP1Exports = [regex]::Matches($storeP1Content, 'export const (use\w+Store)')
      foreach ($se in $storeP1Exports) {
        $sn = $se.Groups[1].Value
        if ($indexContent -notmatch [regex]::Escape($sn)) {
          Warn "P1-INDEX-EXPORT" $modName "" "store.ts        '$sn'        index.ts          "
        }
      }
    }

    #        constants.ts       
    $constantsP1Path = Join-Path $modPath "constants.ts"
    if (Test-Path $constantsP1Path) {
      $constContent = Get-FileContent $constantsP1Path
      $constExports = [regex]::Matches($constContent, 'export const ([A-Z][A-Z0-9_]+)')
      foreach ($ce in $constExports) {
        $cn = $ce.Groups[1].Value
        if ($indexContent -notmatch [regex]::Escape($cn)) {
          Warn "P1-INDEX-EXPORT" $modName "" "constants.ts              '$cn'        index.ts          "
        }
      }
    }
  }

  #                                                                                                                                                                      
  #                
  #                                                                                                                                                                      
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

      #           C9:     MOD                                            
      $crossModPattern = "from\s+'@/mods/(mod-[a-z0-9-]+)(/.+?)?'"
      $crossMatches = [regex]::Matches($content, $crossModPattern)
      foreach ($m in $crossMatches) {
        $importedMod = $m.Groups[1].Value
        $subPathVal = $m.Groups[2].Value
        if ($importedMod -eq $modName) { continue }
        if ($subPathVal -and $subPathVal -ne "" -and $subPathVal -ne "/index") {
          $allowedSecondary = $false
          $entryName = $subPathVal.TrimStart('/')
          if ($Script:AllowedSecondaryPublicImports.ContainsKey($importedMod)) {
            foreach ($allowed in $Script:AllowedSecondaryPublicImports[$importedMod]) {
              $base = [System.IO.Path]::GetFileNameWithoutExtension($allowed)
              if ($entryName -eq $base -or $entryName -eq $allowed) { $allowedSecondary = $true; break }
            }
          }
          if ($allowedSecondary) { continue }
          if ($subPathVal -match '/_internal/') {
            Fail "C9-CROSS-INTERNAL" $relPath "" "          MOD        _internal/   '@/mods/${importedMod}${subPathVal}'"
          } else {
            Fail "C9-CROSS-PATH" $relPath "" "          MOD           index.ts   '@/mods/${importedMod}${subPathVal}'"
          }
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

  #                                                                                                                                                                      
  # Store       
  #                                                                                                                                                                      
  $storePath = Join-Path $modPath "store.ts"
  if (Test-Path $storePath) {
    $storeContent = Get-FileContent $storePath

    #           C10: Store                 
    $storeNameMatch = [regex]::Match($storeContent, 'export const (use\w+Store)')
    if ($storeNameMatch.Success) {
      $storeName = $storeNameMatch.Groups[1].Value
      if ($storeName -match '^use[A-Z]\w+Store$') {
        Pass "C10-STORE-NAME" $modName "Store              use{PascalCase}Store   $storeName"
      } else {
        Fail "C10-STORE-NAME" $modName "" "Store                 use{PascalCase}Store   $storeName"
      }
      #     manifest       
      $manifestStores = @(Get-DeclaredStringArray $manifestRaw 'stores')
      if ($storeName -notin $manifestStores) {
        Fail "C10-STORE-MANIFEST" $modName "" "Store '$storeName'        manifest.ts stores          "
      }
    }

    #           C13: Zustand getSummary          
    if ($storeContent -match 'getSummary') {
      if ($storeContent -match 'const\s+\w+\s*=\s*get\(\)') {
        Pass "C13-GETSUMMARY" $modName "getSummary()        get()        selector                "
      } else {
        Warn "C13-GETSUMMARY" $modName "" "getSummary()                          get()       "
      }
    }
    #           C10-STORE-MIDDLEWARE:        Zustand                    
    if ($storeContent -notmatch '\bdevtools\s*\(') {
      Warn "C10-STORE-MIDDLEWARE" $modName "" "Store        devtools()          "
    }
    if ($storeContent -notmatch "\bpersist\s*\(") {
      Warn "C10-STORE-MIDDLEWARE" $modName "" "Store        persist()          "
    }
  }

  #           hooks.ts                       
  $hooksPath = Join-Path $modPath "hooks.ts"
  if (Test-Path $hooksPath) {
    $hooksContent = Get-FileContent $hooksPath
    $hookExports = [regex]::Matches($hooksContent, 'export function (use\w+)')
    foreach ($h in $hookExports) {
      $hn = $h.Groups[1].Value
      if ($hn -match '^use[A-Z]') {
        Pass "C10-HOOK-NAME" $modName "Hook              use{PascalCase}   $hn"
      } else {
        Fail "C10-HOOK-NAME" $modName "" "Hook                 use{PascalCase}   $hn"
      }
    }
    #           C10-HOOK-FORMAT:        const                             
    $constHookMatches = [regex]::Matches($hooksContent, 'export const (use\w+)\s*=')
    foreach ($ch in $constHookMatches) {
      Warn "C10-HOOK-FORMAT" $modName "" "Hook '$($ch.Groups[1].Value)'        'export const ='                    'export function'"
    }
  }

  #                                                                                                                                                                      
  #                   C9    MOD       + D5           + D2             
  #                                                                                                                                                                      
  $modTsFiles = Get-ChildItem -Path $modPath -Recurse -Include *.ts,*.tsx -File
  $crossModImports = @{}  #        D2       
  foreach ($tsFile in $modTsFiles) {
    $tsContent = Get-FileContent $tsFile.FullName
    if (-not $tsContent) { continue }
    $fname = "src/mods/${modName}/" + $tsFile.FullName.Substring($modPath.Length + 1).Replace('\', '/')
    $fpath = $tsFile.FullName

    #           C9:     MOD                       
    $isInactiveSubsystem = (
      $tsFile.Directory.Name -eq 'subsystems' -and
      $tsFile.Name -like '*-system.ts' -and
      -not (Test-IsActiveRuntimeSubsystemFile $tsFile.FullName)
    )
    $skipCrossDependencyScan =
      (Test-IsGeneratedPublicBoundaryException $fname) -or $isInactiveSubsystem
    $crossMatches = if ($skipCrossDependencyScan) {
      @()
    } else {
      [regex]::Matches($tsContent, "from\s+'@/mods/(mod-[a-z0-9-]+)(/.+?)?'")
    }
    foreach ($cm in $crossMatches) {
      $impMod = $cm.Groups[1].Value
      $sub = $cm.Groups[2].Value
      if ($impMod -eq $modName) { continue }
      #           MOD                    D2          
      if (-not $crossModImports.ContainsKey($impMod)) { $crossModImports[$impMod] = $true }
      if ($sub -and $sub -ne "" -and $sub -ne "/index") {
        $allowedSecondary = $false
        $entryName = $sub.TrimStart('/')
        if ($Script:AllowedSecondaryPublicImports.ContainsKey($impMod)) {
          foreach ($allowed in $Script:AllowedSecondaryPublicImports[$impMod]) {
            $base = [System.IO.Path]::GetFileNameWithoutExtension($allowed)
            if ($entryName -eq $base -or $entryName -eq $allowed) { $allowedSecondary = $true; break }
          }
        }
        if ($allowedSecondary) { continue }
        if ($sub -match '/_internal/') {
          Fail "C9-CROSS-INTERNAL" $fname "" "          @/mods/${impMod}        _internal/"
        } else {
          Fail "C9-CROSS-PATH" $fname "" "          @/mods/${impMod}       index.ts                                  '$sub'"
        }
      }
    }

    #           D5:                                
    $storageKeyMatches = [regex]::Matches($tsContent, "(['])(mod-[a-z0-9-]+:[a-z0-9-]+(?::[a-z0-9-]+){0,2})(['])")
    foreach ($sk in $storageKeyMatches) {
      $key = $sk.Groups[2].Value
      #                       emits/listens                         
      if ($key -match ':[a-z]+-[a-z-]+$') { continue }
      $parts = $key -split ':'
      $expectedMod = $modName
      if ($parts[0] -ne $expectedMod) {
        if ($parts[0] -match '^mod-') {
          Warn "D5-STORAGE-KEY" $fname "" "          '$key'     MOD        '$($parts[0])'           MOD '$modName'          "
        }
      }
      if ($parts.Count -lt 2 -or $parts.Count -gt 4) {
        Warn "D5-STORAGE-KEY" $fname "" "          '$key'                      2-4      {mod}:{category}[:{key}]   "
      }
      # Validate category field
      if ($parts.Count -ge 2) {
        $validCategories = @("config", "save", "cache", "temp")
        if ($parts[1] -notin $validCategories) {
          Warn "D5-STORAGE-KEY" $fname "" "          '$key'     category '$($parts[1])'                     ${validCategories}   "
        }
      }
    }
  }

  #           D2: dependencies                                     MOD                   
  $declaredDeps = @(Get-DeclaredStringArray $manifestRaw 'dependencies')
  foreach ($impMod in $crossModImports.Keys) {
    if ($impMod -notin $declaredDeps) {
      Warn "D2-DEP-MISSING" $modName "" "public source import from '$impMod' has no lifecycle dependency declaration; add one only when load ordering is required"
    }
  }
  foreach ($dep in $declaredDeps) {
    if ($dep -notin $crossModImports.Keys) {
      $modFiles = Get-ChildItem -Path $modPath -Recurse -Filter *.ts -File
      $depUsed = $false
      foreach ($mf in $modFiles) {
        $mc = Get-FileContent $mf.FullName
        if ($mc -match [regex]::Escape("@/mods/${dep}")) { $depUsed = $true; break }
      }
      if (-not $depUsed) {
        Pass "D2-DEP-UNUSED" $modName "manifest              '$dep'                                               RoundContext          "
      }
    }
  }
}  # end foreach modDir

#
