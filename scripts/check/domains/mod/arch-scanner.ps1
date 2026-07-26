# arch-scanner.ps1                    
#             C1-C14 (         ) | D1-D5 (      ) | E1 (Prompt) | P1 (index      ) | C10/C13 (Store/Hook)
#                 MOD                 +           +    MOD       +             
#          checker-utils.ps1                      dot-source   
#                             $modsDir, $modDirs, $SrcDir, $VerboseOutput

Write-Host ""
Write-Host "                                   " -ForegroundColor Cyan

$archStartErrors = $E.Errors
$archStartWarnings = $E.Warnings

$Script:AllowedSecondaryPublicImports = @{}
$Script:GeneratedPublicBoundaryExceptions = @()
$checkDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$archRulesPath = [System.IO.Path]::Combine($checkDir, "rules", "architecture-rules.json")
if (Test-Path $archRulesPath) {
  try {
    $archJson = Get-Content $archRulesPath -Raw | ConvertFrom-Json
    if ($archJson.allowedSecondaryPublicImports) {
      foreach ($prop in $archJson.allowedSecondaryPublicImports.PSObject.Properties) {
        $Script:AllowedSecondaryPublicImports[$prop.Name] = @($prop.Value)
      }
    }
    if ($archJson.generatedPublicBoundaryExceptions) {
      $Script:GeneratedPublicBoundaryExceptions = @($archJson.generatedPublicBoundaryExceptions)
    }
  } catch {
    Warn "ARCH-RULES" "scripts/check/rules/architecture-rules.json" "" "Failed to parse architecture-rules.json"
  }
}

$Script:RuntimePolicyLoaded = $false
$Script:ActiveRuntimeSubsystemIds = [System.Collections.Generic.HashSet[string]]::new()
$Script:NarrativeWritableSubsystemIds = [System.Collections.Generic.HashSet[string]]::new()
$runtimePolicyPath = Join-Path $modsDir 'mod-engine\helpers\mvp-stages-config.default.json'
if (Test-Path $runtimePolicyPath) {
  try {
    $runtimePolicy = Get-FileContent $runtimePolicyPath | ConvertFrom-Json
    $runtimeStage = $runtimePolicy.stages.($runtimePolicy.currentStage)
    foreach ($id in @($runtimeStage.runtime.external) + @($runtimeStage.runtime.engine)) {
      [void]$Script:ActiveRuntimeSubsystemIds.Add([string]$id)
    }
    foreach ($id in @($runtimeStage.narrativeChange)) {
      [void]$Script:NarrativeWritableSubsystemIds.Add([string]$id)
    }
    $Script:RuntimePolicyLoaded = $true
  } catch {
    Fail 'C0-RUNTIME-POLICY' 'src/mods/mod-engine/helpers/mvp-stages-config.default.json' '' 'unable to parse the active runtime subsystem policy'
  }
} else {
  Fail 'C0-RUNTIME-POLICY' 'src/mods/mod-engine/helpers/mvp-stages-config.default.json' '' 'active runtime subsystem policy is missing'
}

function Get-SubsystemIdFromContent($content) {
  $idMatch = [regex]::Match($content, "readonly\s+id\s*=\s*'([^']+)'(?:\s+as\s+const)?")
  if ($idMatch.Success) { return $idMatch.Groups[1].Value }
  return $null
}

function Test-IsActiveRuntimeSubsystemFile($filePath) {
  if (-not $Script:RuntimePolicyLoaded) { return $true }
  $content = Get-FileContent $filePath
  $id = Get-SubsystemIdFromContent $content
  return $id -and $Script:ActiveRuntimeSubsystemIds.Contains($id)
}

function Test-IsGeneratedPublicBoundaryException($relativePath) {
  $normalized = $relativePath.Replace('\\', '/')
  foreach ($prefix in $Script:GeneratedPublicBoundaryExceptions) {
    if ($normalized.StartsWith(([string]$prefix).Replace('\\', '/'))) { return $true }
  }
  return $false
}

function Resolve-ModDependencyName($dep) {
  $d = $dep.Trim()
  if ($d.StartsWith('~') -or $d.StartsWith('?') -or $d.StartsWith('!')) {
    return $d.Substring(1).Trim()
  }
  return $d
}

function Get-ModTier($modName) {
  $tierMap = @{
    'mod-engine' = 'Engine'
    'mod-character' = 'Data'
    'mod-difficulty' = 'Data'
    'mod-npc' = 'Data'
    'mod-world' = 'World'
    'mod-base-universe' = 'World'
    'mod-power-system' = 'World'
    'mod-tech-level' = 'World'
    'mod-environment-ecology' = 'World'
    'mod-history-dynamics' = 'World'
    'mod-economy' = 'Social'
    'mod-politics' = 'Social'
    'mod-culture' = 'Social'
    'mod-social-civilization' = 'Social'
    'mod-ui' = 'UI'
    'mod-settings' = 'UI'
    'mod-world-map' = 'UI'
    'mod-pages' = 'Page'
  }
  if ($tierMap.ContainsKey($modName)) { return $tierMap[$modName] }
  return $null
}

#                                                                                                                                                                      
# Pre-pass:              manifest              D2/D3             
#                                                                                                                                                                      
$AllManifests = @{}
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
      if ($pc -notmatch "outputFormat:\s*'(json|text|markdown)'") {
        Fail "E1-PROMPT-FORMAT" $pfRel "" "Prompt              outputFormat   'json'|'text'|'markdown'   "
        $e1AllOk = $false
      }
      if ($pc -notmatch 'outputSchema:') {
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
        Pass "E1-PROMPT" $pfRel "Prompt                      outputFormat + outputSchema + name + version   "
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
      $hasStructuredClone = ($content -match 'structuredClone\(')
      $hasAsUnknown = ($content -match 'as unknown as Record<string, unknown>')
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
      $hasSummaryField = $content -match '\bsummary\s*:'
      $hasSummaryShorthand =
        ($content -match '\b(?:const|let|var)\s+summary\s*=') -and
        ($content -match 'return\s*\{[\s\S]*?\bsummary\b')
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
# Post-pass: D3                   
#                                                                                                                                                                      
Write-Host ""
Write-Host "--- Post-pass: D3                    ---" -ForegroundColor Cyan
$modNames = $AllManifests.Keys
foreach ($mn in $modNames) {
  $info = $AllManifests[$mn]
  foreach ($dep in $info.dependencies) {
    if ($AllManifests.ContainsKey($dep) -and $dep -ne $mn) {
      $depInfo = $AllManifests[$dep]
      if ($depInfo.dependencies -contains $mn) {
        Fail "D3-CYCLE" $mn "" "               '$mn'     '$dep'                   "
      }
    }
  }
}
#                             Kahn          
$inDegree = @{}
$graph = @{}
foreach ($mn in $modNames) { $inDegree[$mn] = 0; $graph[$mn] = @() }
foreach ($mn in $modNames) {
  $info = $AllManifests[$mn]
  foreach ($dep in $info.dependencies) {
    if ($modNames -contains $dep) {
      $graph[$dep] += $mn  # dep     mn (dep must load before mn)
      $inDegree[$mn]++
    }
  }
}
$queue = [System.Collections.Queue]::new()
foreach ($mn in $modNames) {
  if ($inDegree[$mn] -eq 0) { $queue.Enqueue($mn) }
}
$visited = 0
while ($queue.Count -gt 0) {
  $node = $queue.Dequeue()
  $visited++
  foreach ($neighbor in $graph[$node]) {
    $inDegree[$neighbor]--
    if ($inDegree[$neighbor] -eq 0) { $queue.Enqueue($neighbor) }
  }
}
if ($visited -lt $modNames.Count) {
  $unvisited = $modNames | Where-Object { $inDegree[$_] -gt 0 }
  Fail "D3-CYCLE" "      " "" "                                  $($unvisited -join ', ')                      "
} else {
  Pass "D3-CYCLE" "      " "                              $visited     MOD                   "
}

#                                                                                                                                                                      
# D30-DEP-EXISTS: declared dependencies must exist as MODs in the project
#                                                                                                                                                                      
Write-Host ""
Write-Host "--- D30-DEP-EXISTS: dependency existence check ---" -ForegroundColor Cyan
$actualModDirs = @($modDirs | ForEach-Object { $_.Name })
foreach ($mn in $modNames) {
  $info = $AllManifests[$mn]
  foreach ($dep in $info.dependencies) {
    $depName = Resolve-ModDependencyName $dep
    if ($dep.Trim().StartsWith('?') -and $depName -notin $actualModDirs) { continue }
    if ($depName -notin $actualModDirs) {
      Fail "D30-DEP-EXISTS" $mn "" "declared dependency '$dep' does not exist as a MOD in src/mods/"
    }
  }
}

# ============================================================
# Post-pass 2: File Responsibility Purity Check (G-class)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 2: G File Purity Check ---" -ForegroundColor Cyan

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName

  # G1: types.ts purity check
  $typesPath = Join-Path $modPath "types.ts"
  if (Test-Path $typesPath) {
    $typesContent = Get-FileContent $typesPath
    if ($typesContent -match 'export (?:const|function|class)\s') {
      Warn "G1-TYPES-FUNC" $modName "" "types.ts contains runtime exports; consider moving them when the owning contract is next changed"
    }
    if ($typesContent -match "from\s+'react'") {
      Fail "G1-TYPES-REACT" $modName "" "types.ts imports React, type files should not have runtime dependencies"
    }
    if ($typesContent -match "from\s+'next") {
      Warn "G1-TYPES-NEXT" $modName "" "types.ts imports Next.js, recommend avoiding runtime dependencies"
    }
  }

  # G2: constants.ts purity check
  $constPath = Join-Path $modPath "constants.ts"
  if (Test-Path $constPath) {
    $constContent = Get-FileContent $constPath
    if ($constContent -match 'export (?:interface|type|enum)\s') {
      Warn "G2-CONST-TYPE" $modName "" "constants.ts contains type exports; consider moving them when the owning contract is next changed"
    }
    if ($constContent -match 'export (?:function|const\s+\w+\s*=\s*\()') {
      Warn "G2-CONST-FUNC" $modName "" "constants.ts contains helper functions; consider moving them when the owning contract is next changed"
    }
  }

  # G3: utils.ts purity check
  $utilsPath = Join-Path $modPath "utils.ts"
  if (Test-Path $utilsPath) {
    $utilsContent = Get-FileContent $utilsPath
    if ($utilsContent -match 'export (?:interface|type|enum)\s') {
      Warn "G3-UTILS-TYPE" $modName "" "utils.ts contains type definitions, recommend extracting to types.ts"
    }
    if ($utilsContent -match 'export const [A-Z_]+\s*=') {
      Warn "G3-UTILS-CONST" $modName "" "utils.ts contains constant definitions, recommend extracting to constants.ts"
    }
    if ($utilsContent -match 'use[A-Z]\w+\s*\(') {
      Fail "G3-UTILS-HOOK" $modName "" "utils.ts contains React Hook, utility files should not contain Hooks"
    }
  }

  # G4: subsystems/ purity check
  $subDir = Join-Path $modPath "subsystems"
  if (Test-Path $subDir) {
    $subFiles = @(Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
    foreach ($sf in $subFiles) {
      $sc = Get-FileContent $sf.FullName
      $relPath = "src/mods/${modName}/subsystems/$($sf.Name)"
      if ($sc -match 'export (?:interface|type|enum)\s') {
        Warn "G4-SUB-TYPE" $relPath "" "subsystem contains type definitions, recommend extracting to types.ts"
      }
      if ($sc -match 'export const [A-Z_]+\s*=') {
        Warn "G4-SUB-CONST" $relPath "" "subsystem contains constant definitions, recommend extracting to constants.ts"
      }
      if ($sc -match '(?:const|let|var)\s+\w+\s*=\s*/.+/' -and $modName -eq 'mod-engine') {
        Warn "G4-SUB-REGEX" $relPath "" "subsystem contains hardcoded regex, recommend extracting to patterns/ directory"
      }
    }
  }

  # G8: index.ts export check
  $idxPath = Join-Path $modPath "index.ts"
  if (Test-Path $idxPath) {
    $idxContent = Get-FileContent $idxPath
    if ($idxContent -match 'export\s+\*') {
      Fail "H1-INDEX-EXPORT-ALL" $modName "" "index.ts uses export *, must use named exports"
    }
    $nonExportLines = @()
    foreach ($line in ($idxContent -split "`n")) {
      $trimmed = $line.Trim()
      if ($trimmed -eq '' -or $trimmed -match '^\s*//' -or $trimmed -match '^\s*\*' -or $trimmed -match '^\s*export' -or $trimmed -match '^\s*import') { continue }
      $nonExportLines += $trimmed
    }
    if ($nonExportLines.Count -gt 5) {
      Warn "H1-INDEX-LOGIC" $modName "" "index.ts contains $($nonExportLines.Count) lines of non-export code, should only have named exports"
    }
  }

  # G6: store.ts purity check
  $storePath = Join-Path $modPath "store.ts"
  if (Test-Path $storePath) {
    $storeContent = Get-FileContent $storePath
    if ($storeContent -match 'export (?:interface|type|enum)\s') {
      Warn "G6-STORE-TYPE" $modName "" "store.ts contains type definitions, recommend extracting to types.ts"
    }
  }

  # G7: hooks.ts purity check
  $hooksPath = Join-Path $modPath "hooks.ts"
  if (Test-Path $hooksPath) {
    $hooksContent = Get-FileContent $hooksPath
    if ($hooksContent -match 'export (?:interface|type|enum)\s') {
      Warn "G7-HOOKS-TYPE" $modName "" "hooks.ts contains type definitions, recommend extracting to types.ts"
    }
    if ($hooksContent -match 'export const [A-Z_]+\s*=') {
      Warn "G7-HOOKS-CONST" $modName "" "hooks.ts contains constant definitions, recommend extracting to constants.ts"
    }
  }
}

# ============================================================
# Post-pass 3: Dependency Direction Check (D24)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 3: D24 Dependency Direction Check ---" -ForegroundColor Cyan

$loSegments = @(
  @{Name="Engine"; AllowedDeps=@() },
  @{Name="Data"; AllowedDeps=@("Engine") },
  @{Name="World"; AllowedDeps=@("Engine","Data") },
  @{Name="Social"; AllowedDeps=@("Engine","Data","World") },
  @{Name="UI"; AllowedDeps=@("Engine","Data","World","Social") },
  @{Name="Page"; AllowedDeps=@("Engine","Data","World","Social","UI") }
)

foreach ($mn in $AllManifests.Keys) {
  $info = $AllManifests[$mn]
  $myTier = Get-ModTier $mn
  if (-not $myTier) { continue }
  $mySegment = $loSegments | Where-Object { $_.Name -eq $myTier } | Select-Object -First 1
  if (-not $mySegment) { continue }

  foreach ($dep in $info.dependencies) {
    $depName = Resolve-ModDependencyName $dep
    if (-not $AllManifests.ContainsKey($depName)) { continue }
    $depTier = Get-ModTier $depName
    if (-not $depTier) { continue }
    $depSegment = $loSegments | Where-Object { $_.Name -eq $depTier } | Select-Object -First 1
    if (-not $depSegment) { continue }

    if ($mySegment.Name -eq "Engine" -and $depSegment.Name -ne "Engine") {
      Warn "D24-SEGMENT-REVERSE" $mn "" "legacy tier model flags dependency on $($depSegment.Name)-level MOD '$depName'; verify against the active public contract"
    }
    if ($depSegment.Name -notin $mySegment.AllowedDeps -and $depSegment.Name -ne $mySegment.Name) {
      Warn "D24-SEGMENT-REVERSE" $mn "" "legacy tier model flags '$mn' -> '$depName'; current authority only enforces app -> mods -> core -> foundation and public MOD boundaries"
    }
  }
}

# ============================================================
# Post-pass 4: Fault Isolation Check (F-class)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 4: F Fault Isolation Check ---" -ForegroundColor Cyan

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName

  $modTsFiles = @(Get-ChildItem -Path $modPath -Recurse -Include "*.ts" -File)
  foreach ($tsFile in $modTsFiles) {
    $tsContent = Get-FileContent $tsFile.FullName
    $relPath = "src/mods/${modName}/$($tsFile.Name)"

    # F1: Cross-MOD import with try-catch or dynamic import
    $crossModImports = [regex]::Matches($tsContent, "from\s+'@/mods/(mod-[a-z0-9-]+)(/index)?'")
    if ($crossModImports.Count -gt 0 -and $tsFile.Name -ne 'manifest.ts') {
      foreach ($cm in $crossModImports) {
        $impMod = $cm.Groups[1].Value
        if ($impMod -eq $modName) { continue }
        if ($tsContent -notmatch 'try\s*\{' -and $tsContent -notmatch 'import\s*\(') {
          Warn "F1-NO-TRY-CATCH" $relPath "" "File imports '$impMod' but no try-catch or dynamic import fallback found"
        }
      }
    }

    # F2: Event listener error capture
    if ($tsContent -match '\.on\(' -and $tsContent -notmatch 'try\s*\{') {
      Warn "F2-EVENT-NO-CATCH" $relPath "" "File contains event listener (.on()) but no try-catch error capture"
    }

    # F3: Store read with default value
    if ($tsContent -match 'use\w+Store\s*\(' -and $tsContent -notmatch '\?\?' -and $tsContent -notmatch '\?\.' -and $tsFile.Name -ne 'store.ts') {
      Warn "F3-STORE-NO-DEFAULT" $relPath "" "File reads Store but does not use ?? or ?. to provide default value"
    }
  }
}

$archErrors = $E.Errors - $archStartErrors
$archWarnings = $E.Warnings - $archStartWarnings
Write-Host "                    : $archErrors       , $archWarnings       " -ForegroundColor $(if ($archErrors -gt 0) { "Red" } else { "Green" })

# ============================================================
# Post-pass 5: Pattern Management Layer Check (D18)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 5: D18 Pattern Management Layer ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $mp = Join-Path $md.FullName "manifest.ts"
  if (-not (Test-Path $mp)) { continue }
  $mc = Get-FileContent $mp
  # Check if manifest declares patterns-related provides or subsystems
  if ($mc -notmatch "patterns" -and $mc -notmatch "Pattern") { continue }

  $patternsDir = Join-Path $md.FullName "patterns"
  $patternRequiredFiles = @("pattern-types.ts", "base-pattern.ts", "pattern-registry.ts", "pattern-factory.ts")
  foreach ($prf in $patternRequiredFiles) {
    $prfPath = Join-Path $patternsDir $prf
    if (-not (Test-Path $prfPath)) {
      Warn "D18-PATTERN-FILE" $mn "" "patterns/ missing required file: $prf"
    }
  }

  # Check pattern-types.ts for required type definitions
  $ptPath = Join-Path $patternsDir "pattern-types.ts"
  if (Test-Path $ptPath) {
    $ptContent = Get-FileContent $ptPath
    if ($ptContent -notmatch 'PatternCategory') {
      Warn "D18-PATTERN-TYPE" $mn "" "pattern-types.ts missing PatternCategory type"
    }
    if ($ptContent -notmatch 'PatternDefinition') {
      Warn "D18-PATTERN-TYPE" $mn "" "pattern-types.ts missing PatternDefinition type"
    }
  }

  # Check base-pattern.ts for BasePattern abstract class
  $bpPath = Join-Path $patternsDir "base-pattern.ts"
  if (Test-Path $bpPath) {
    $bpContent = Get-FileContent $bpPath
    if ($bpContent -notmatch 'abstract class BasePattern') {
      Fail "D18-PATTERN-BASE" $mn "" "base-pattern.ts missing abstract class BasePattern"
    }
  }

  # Check pattern-factory.ts for USE_PATTERN_MANAGER flag
  $pfPath = Join-Path $patternsDir "pattern-factory.ts"
  if (Test-Path $pfPath) {
    $pfContent = Get-FileContent $pfPath
    if ($pfContent -notmatch 'USE_PATTERN_MANAGER') {
      Warn "D18-PATTERN-FLAG" $mn "" "pattern-factory.ts missing USE_PATTERN_MANAGER feature flag"
    }
  }
}

# ============================================================
# Post-pass 6: manifest pure declarative check (G9)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 6: G9 Manifest Purity ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $mp = Join-Path $md.FullName "manifest.ts"
  if (-not (Test-Path $mp)) { continue }
  $mc = Get-FileContent $mp
  if ($mc -match 'export const\s') {
    Fail "G9-MANIFEST-IMPL" $mn "" "manifest.ts contains 'export const' - manifest should be pure declaration"
  }
  if ($mc -match 'export function\s') {
    Fail "G9-MANIFEST-IMPL" $mn "" "manifest.ts contains 'export function' - manifest should be pure declaration"
  }
  if ($mc -notmatch 'defineMod\(') {
    Fail "G9-MANIFEST-DEFINE" $mn "" "manifest.ts should use defineMod() wrapper"
  }
}

# ============================================================
# Post-pass 7: Prompt file purity check (G10)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 7: G10 Prompt File Purity ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $promptsDir = Join-Path $md.FullName "prompts"
  if (-not (Test-Path $promptsDir)) { continue }
  $promptFiles = @(Get-ChildItem -Path $promptsDir -Filter "*.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "index.ts" })
  foreach ($pf in $promptFiles) {
    $pc = Get-FileContent $pf.FullName
    $pfRel = "src/mods/${mn}/prompts/$($pf.Name)"
    if ($pc -match 'export interface\s') {
      Warn "G10-PROMPT-TYPE" $pfRel "" "Prompt file also owns an exported interface; keep it with the prompt unless a separate shared contract owner is needed"
    }
    if ($pc -match 'export type\s') {
      Warn "G10-PROMPT-TYPE" $pfRel "" "Prompt file also owns an exported type; keep it with the prompt unless a separate shared contract owner is needed"
    }
    if ($pc -match 'export class\s') {
      Fail "G10-PROMPT-CLASS" $pfRel "" "Prompt file contains 'export class' - should only contain PromptTemplate objects"
    }
  }
}

# ============================================================
# Post-pass 8: Internal types should not export (H2)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 8: H2 Internal Type Export ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $typesPath = Join-Path $md.FullName "types.ts"
  if (-not (Test-Path $typesPath)) { continue }
  $tc = Get-FileContent $typesPath
  $internalTypeMatches = [regex]::Matches($tc, 'export (?:interface|type|enum)\s+(\w*(?:Internal|Cache|Private)\w*)')
  foreach ($itm in $internalTypeMatches) {
    $typeName = $itm.Groups[1].Value
    Warn "H2-INTERNAL-EXPORT" $mn "" "types.ts exports '$typeName' which appears to be internal (contains Internal/Cache/Private)"
  }
}

# ============================================================
# Post-pass 9: applyChanges cross-subsystem read check (C17)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 9: C17 applyChanges Cross-Subsystem Read ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $subDir = Join-Path $md.FullName "subsystems"
  if (-not (Test-Path $subDir)) { continue }
  $subFiles = @(Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
  foreach ($sf in $subFiles) {
    $sc = Get-FileContent $sf.FullName
    # Find applyChanges method body
    $acMatch = [regex]::Match($sc, 'applyChanges\([\s\S]*?\{([\s\S]*?)\n\s*\}')
    if ($acMatch.Success) {
      $acBody = $acMatch.Groups[1].Value
      # Check for cross-subsystem store reads
      if ($acBody -match 'use\w+Store\s*\(') {
        Warn "C17-CROSS-SUBSYSTEM" "src/mods/${mn}/subsystems/$($sf.Name)" "" "applyChanges() reads another Store, subsystems should only operate on own data"
      }
    }
  }
}

# ============================================================
# Post-pass 10: Private constants shouldn't export (H3)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 10: H3 Private Constant Export ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $constPath = Join-Path $md.FullName "constants.ts"
  if (-not (Test-Path $constPath)) { continue }
  $cc = Get-FileContent $constPath
  $privateConstMatches = [regex]::Matches($cc, 'export const ([A-Z][A-Z0-9_]*(?:INTERNAL|PRIVATE|TEMP|DEBUG)[A-Z0-9_]*)')
  foreach ($pcm in $privateConstMatches) {
    $constName = $pcm.Groups[1].Value
    Warn "H3-PRIVATE-CONST" $mn "" "constants.ts exports '$constName' which appears to be internal (contains INTERNAL/PRIVATE/TEMP/DEBUG)"
  }
}

# ============================================================
# Post-pass 11: Subsystem helper functions shouldn't export (H4)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 11: H4 Subsystem Helper Export ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $subDir = Join-Path $md.FullName "subsystems"
  if (-not (Test-Path $subDir)) { continue }
  $subFiles = @(Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
  foreach ($sf in $subFiles) {
    $sc = Get-FileContent $sf.FullName
    $helperExports = [regex]::Matches($sc, 'export (?:function|const)\s+(\w+)')
    foreach ($he in $helperExports) {
      $helperName = $he.Groups[1].Value
      # Skip subsystem class definitions.
      if ($sc -match "class\s+$helperName\s+(?:implements\s+ISubSystem\b|extends\s+BaseSubsystem\b)") { continue }
      # Skip known exception patterns
      if ($helperName -match 'System$') { continue }
      Warn "H4-HELPER-EXPORT" "src/mods/${mn}/subsystems/$($sf.Name)" "" "subsystem exports helper '$helperName', consider removing export or moving to utils.ts"
    }
  }
}

# ============================================================
# Post-pass 12: PC/Mobile separation check (U5)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 12: U5 PC/Mobile Separation ---" -ForegroundColor Cyan

foreach ($md in $modDirs) {
  $mn = $md.Name
  $componentsDir = Join-Path $md.FullName "components"
  if (-not (Test-Path $componentsDir)) { continue }
  $organismsDir = Join-Path $componentsDir "organisms"
  if (-not (Test-Path $organismsDir)) { continue }

  $orgFiles = @(Get-ChildItem -Path $organismsDir -Filter "*.tsx" -File | Where-Object { $_.Name -notmatch "\.types\.|^index\.|\.desktop\.|\.mobile\." })
  foreach ($of in $orgFiles) {
    $baseName = $of.Name -replace '\.tsx$', ''
    $desktopFile = Join-Path $organismsDir "${baseName}.desktop.tsx"
    $mobileFile = Join-Path $organismsDir "${baseName}.mobile.tsx"
    $selectorFile = Join-Path $organismsDir "${baseName}.tsx"
    if (-not (Test-Path $desktopFile)) {
      Warn "U5-PC-SPLIT" $mn "" "Organism '$baseName' missing ${baseName}.desktop.tsx"
    }
    if (-not (Test-Path $mobileFile)) {
      Warn "U5-PC-SPLIT" $mn "" "Organism '$baseName' missing ${baseName}.mobile.tsx"
    }
  }
}

# ============================================================
# Post-pass 13: G5 Duplicate Utility Function Detection
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 13: G5 Duplicate Utility Check ---" -ForegroundColor Cyan

# Collect all exported function/const names from foundation/utils/
$foundationUtilsDir = Join-Path $SrcDir "foundation\utils"
$foundationExports = @{}
if (Test-Path $foundationUtilsDir) {
  $foundationUtilFiles = @(Get-ChildItem -Path $foundationUtilsDir -Filter "*.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "index.ts" })
  foreach ($fuf in $foundationUtilFiles) {
    $fufContent = Get-FileContent $fuf.FullName
    if (-not $fufContent) { continue }
    $fufRel = "src/foundation/utils/$($fuf.Name)"
    # Match: export function foo or export const foo =
    $fufExports = [regex]::Matches($fufContent, 'export\s+(?:function|const)\s+(\w+)')
    foreach ($fe in $fufExports) {
      $fname = $fe.Groups[1].Value
      $foundationExports[$fname] = $fufRel
    }
  }
}

# Also check old foundation/utils.ts directly
$foundationUtilsFile = Join-Path $SrcDir "foundation\utils.ts"
if (Test-Path $foundationUtilsFile) {
  $fuContent = Get-FileContent $foundationUtilsFile
  if ($fuContent) {
    $fuExports = [regex]::Matches($fuContent, 'export\s+(?:function|const)\s+(\w+)')
    foreach ($fe in $fuExports) {
      $fname = $fe.Groups[1].Value
      if (-not $foundationExports.ContainsKey($fname)) {
        $foundationExports[$fname] = "src/foundation/utils.ts"
      }
    }
  }
}

if ($foundationExports.Count -gt 0) {
  # Scan each MOD's utils.ts for duplicates
  foreach ($md in $modDirs) {
    $mn = $md.Name
    $utilsPath = Join-Path $md.FullName "utils.ts"
    if (-not (Test-Path $utilsPath)) { continue }
    $utilsContent = Get-FileContent $utilsPath
    if (-not $utilsContent) { continue }
    $modUtilRel = "src/mods/${mn}/utils.ts"

    $modExports = [regex]::Matches($utilsContent, 'export\s+(?:function|const)\s+(\w+)')
    foreach ($me in $modExports) {
      $fn = $me.Groups[1].Value
      if ($foundationExports.ContainsKey($fn)) {
        $delegateImport = [regex]::Match($utilsContent, "import\s*\{\s*$([regex]::Escape($fn))\s+as\s+(\w+)\s*\}\s*from\s*'@/foundation'")
        if ($delegateImport.Success -and $utilsContent -match "return\s+$([regex]::Escape($delegateImport.Groups[1].Value))\s*\(") {
          Pass 'G5-DUPLICATE-UTIL' $modUtilRel "compatibility wrapper '$fn' delegates to foundation"
        } else {
          Fail "G5-DUPLICATE-UTIL" $modUtilRel "" "Function '$fn' duplicates foundation implementation ($($foundationExports[$fn])) instead of delegating"
        }
      }
    }
  }
  Pass "G5-DUPLICATE-UTIL" "foundation" "Checked $($foundationExports.Count) foundation exports against MOD utils.ts files"
} else {
  Warn "G5-DUPLICATE-UTIL" "foundation" "" "No foundation utility exports found to compare against"
}
