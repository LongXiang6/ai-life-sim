# Purpose: Coordinate deterministic architecture scanner passes for MOD source.
# Owner: quality:mod
# Responsibility: Initialize shared architecture state and load the file and post-pass components in fixed order.

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
    foreach ($id in @($runtimeStage.systemInstruction)) {
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

$archScannerRoot = Join-Path $PSScriptRoot 'arch-scanner'
. (Join-Path $archScannerRoot 'mod-file-pass.ps1')
. (Join-Path $archScannerRoot 'dependency-post-passes.ps1')
. (Join-Path $archScannerRoot 'ownership-post-passes.ps1')
. (Join-Path $archScannerRoot 'quality-post-passes.ps1')
