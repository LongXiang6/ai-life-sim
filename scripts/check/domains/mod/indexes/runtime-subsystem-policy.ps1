# Purpose: Load active and narrative-writable runtime subsystem membership.
# Owner: quality:mod
# Responsibility: Parse runtime policy and answer subsystem activation queries only.

$Script:RuntimePolicyLoaded = $false
$Script:ActiveRuntimeSubsystemIds = [System.Collections.Generic.HashSet[string]]::new()
$Script:NarrativeWritableSubsystemIds = [System.Collections.Generic.HashSet[string]]::new()
$Script:RuntimeSubsystemPolicyError = $null
$runtimePolicyPath = Join-Path $modsDir 'mod-engine/helpers/mvp-stages-config.default.json'
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
    $Script:RuntimeSubsystemPolicyError = 'unable to parse the active runtime subsystem policy'
  }
} else {
  $Script:RuntimeSubsystemPolicyError = 'active runtime subsystem policy is missing'
}

function Get-SubsystemIdFromContent($content) {
  $idMatch = [regex]::Match($content, "readonly\s+id\s*=\s*'([^']+)'(?:\s+as\s+const)?")
  if ($idMatch.Success) { return $idMatch.Groups[1].Value }
  return $null
}

function Test-IsActiveRuntimeSubsystemFile($filePath) {
  if (-not $Script:RuntimePolicyLoaded) { return $true }
  $id = Get-SubsystemIdFromContent (Get-FileContent $filePath)
  return $id -and $Script:ActiveRuntimeSubsystemIds.Contains($id)
}
