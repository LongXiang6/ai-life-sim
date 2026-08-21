# Purpose: Validate critical narrative method reachability from active pipeline entries.
# Owner: quality:narrative
# Responsibility: D34b narrative pipeline method wiring assertions only.

# 2.5b2 D34b: Narrative pipeline critical method wiring
# -------------------------------------------------------
Write-Host ""
Write-Host "  D34b Narrative critical method wiring..." -ForegroundColor DarkGray

$d34bStartErrors = $E.Errors
$emDash = [char]0x2014
$orchestratorEntry = Join-Path $SrcDir "mods/mod-engine/subsystems/orchestrator-system.ts"
$campaignEntry = Join-Path $SrcDir "mods/mod-engine/campaigns/default/index.ts"
$pipelineContent = @(
  Get-ModuleResponsibilityContent $orchestratorEntry
  if (Test-Path $campaignEntry) { Get-FileContent $campaignEntry }
) -join "`n"
$narrativeCriticalMethods = @(
  'assemblePromptContext', 'buildPromptTimelineMemory',
  'prepareNarrativeStoryContinuity', 'prepareNarrativeStoryContinuityLedger',
  'commitPreparedNarrativeStoryContinuity', 'commitPreparedNarrativeStoryContinuityLedger'
)
foreach ($m in $narrativeCriticalMethods) {
  if ($pipelineContent -notmatch "\b$([regex]::Escape($m))\s*\(") {
    Fail "D34b-NARRATIVE-UNWIRED" "mods/mod-engine" "" "Narrative-critical method '$m()' not called in orchestrator or default campaign $emDash story continuity may break"
  }
}

$d34bErrors = $E.Errors - $d34bStartErrors
Write-Host "  D34b : $d34bErrors errors" -ForegroundColor $(if ($d34bErrors -gt 0) { "Red" } else { "Green" })
