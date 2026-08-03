# Purpose: Detect PromptContext fields and template variables that do not reach the AI.
# Owner: quality:mod
# Responsibility: A5 narrative context, variable, and summary-template projection assertions only.

# A5: PromptContext field ↔ template variable mismatch
#    Only checks the narrative prompt template (the one orchestrator calls via
#    assemblePromptContext() → buildPrompt()). Other prompts use fillPromptTemplate()
#    with direct variable objects, not PromptContext, so they are excluded.
# ============================================================
Write-Host "  [A5] Checking PromptContext fields vs narrative template variables..." -ForegroundColor DarkGray

# Read PromptContext interface to know all valid fields
$narrativeTypesPath = [System.IO.Path]::Combine($SrcDir, "foundation", "types", "narrative.types.ts")
$promptCtxFields = @()
if (Test-Path $narrativeTypesPath) {
  $ntContent = Get-FileContent $narrativeTypesPath
  if ($ntContent -match '(?s)interface PromptContext \{([^}]+)\}') {
    $ifaceBlock = $Matches[1]
    $fieldMatches = [regex]::Matches($ifaceBlock, '(\w+)\??\s*:\s*[^;,]+[,;]')
    $promptCtxFields = @($fieldMatches | ForEach-Object { $_.Groups[1].Value })
  }
}

# Read orchestrator to find which PromptContext fields are assigned
$orchPath = [System.IO.Path]::Combine($SrcDir, "mods", "mod-engine", "subsystems", "orchestrator-system.ts")
$orchAssignedFields = @()
$orchContent = ""
if (Test-Path $orchPath) {
  $orchContent = Get-ModuleResponsibilityContent $orchPath
  foreach ($f in $promptCtxFields) {
    if ([regex]::IsMatch($orchContent, "^[ \t]+$([regex]::Escape($f))[ \t]*:", [System.Text.RegularExpressions.RegexOptions]::Multiline)) {
      $orchAssignedFields += $f
    }
  }
}

# Only check the narrative prompt template (the one orchestrated by assemblePromptContext)
$narrativePromptPath = [System.IO.Path]::Combine($SrcDir, "mods", "mod-engine", "prompts", "narrative-prompt.ts")
$narrativeTemplateVars = @()
if (Test-Path $narrativePromptPath) {
  $npContent = Get-FileContent $narrativePromptPath
  if ($npContent -match "variables\s*:\s*\[([^\]]+)\]") {
    $varBlock = $Matches[1]
    $varMatches = [regex]::Matches($varBlock, "'(\w+)'")
    $narrativeTemplateVars = @($varMatches | ForEach-Object { $_.Groups[1].Value })
  }
}

# The narrative template does NOT use variables[]/{{placeholder}} at runtime: buildPrompt() routes
# name==='narrative' to buildNarrativeUserJson(context) in prompt-builder.ts, which maps each
# context.<field> to a Chinese JSON key. So a field also reaches the AI if it is consumed there —
# checking variables[] alone falsely flags fields injected only via buildNarrativeUserJson.
$promptBuilderPath = [System.IO.Path]::Combine($SrcDir, "core", "ai-service", "prompt-builder.ts")
$promptBuilderCtxFields = @()
if (Test-Path $promptBuilderPath) {
  $pbContent = Get-FileContent $promptBuilderPath
  $pbMatches = [regex]::Matches($pbContent, "context\.(\w+)")
  $promptBuilderCtxFields = @($pbMatches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
}

# Check A: PromptContext field assigned by orchestrator but reaching the AI through NEITHER the
# narrative template variables[] NOR buildNarrativeUserJson(context.<field>) → truly never reaches AI
foreach ($f in $orchAssignedFields) {
  if (($f -notin $narrativeTemplateVars) -and ($f -notin $promptBuilderCtxFields)) {
    Fail "A5-CTX-ORPHAN" "orchestrator-system.ts" "" "PromptContext field '$f' is assigned in assemblePromptContext() but neither narrative template variables[] nor buildNarrativeUserJson consume it - data computed every round but never reaches the AI"
  }
}

# Check B: narrative template variables that are NOT in PromptContext interface
foreach ($v in $narrativeTemplateVars) {
  if ($v -notin $promptCtxFields) {
    Fail "A5-VAR-MISSING" "mods/mod-engine/prompts/narrative-prompt.ts" "" "Template variable '{{$v}}' is in variables[] but '$v' does not exist in PromptContext interface - will always resolve to empty string in narrative prompt"
  }
}

# A5b: summary-prompt template variables must appear in userPromptTemplate
$summaryPromptPath = [System.IO.Path]::Combine($SrcDir, "mods", "mod-engine", "prompts", "summary-prompt.ts")
if (Test-Path $summaryPromptPath) {
  $spContent = Get-FileContent $summaryPromptPath
  if ($spContent -match "variables\s*:\s*\[([^\]]+)\]") {
    $spVarBlock = $Matches[1]
    $spVars = @([regex]::Matches($spVarBlock, "'(\w+)'") | ForEach-Object { $_.Groups[1].Value })
    foreach ($sv in $spVars) {
      if ($spContent -notmatch "\{\{$([regex]::Escape($sv))\}\}") {
        Fail "A5-SUMMARY-VAR" "mods/mod-engine/prompts/summary-prompt.ts" "" "summaryPrompt variables[] declares '$sv' but userPromptTemplate has no {{$sv}}"
      }
    }
  }
}
