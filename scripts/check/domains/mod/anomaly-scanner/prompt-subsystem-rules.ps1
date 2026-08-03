# Purpose: Detect PromptContext projection gaps and orphaned runtime subsystem methods.
# Owner: quality:mod
# Responsibility: A5-A6 anomaly rules only.

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

# ============================================================
# A6: Orphaned subsystem methods (public but never called by orchestrator)
#     Only targets runtime subsystems registered with orchestrator (via register-subsystems.ts),
#     NOT infrastructure subsystems called directly from world-init-bundle or other bootstrap code.
# ============================================================
Write-Host "  [A6] Checking orphaned subsystem methods..." -ForegroundColor DarkGray

# JavaScript/TypeScript keywords that are NOT method names
$jsKeywords = @('if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'delete',
                'throw', 'else', 'default', 'case', 'break', 'continue', 'try', 'finally', 'do', 'in', 'of',
                'void', 'this', 'super', 'class', 'extends', 'import', 'export', 'from', 'as', 'const',
                'let', 'var', 'static', 'get', 'set', 'enum', 'interface', 'type', 'namespace', 'module',
                'implements', 'yield', 'await', 'require')

# Read register-subsystems.ts to identify which subsystems are runtime-registered
$registerPath = [System.IO.Path]::Combine($SrcDir, "mods", "mod-engine", "bootstrap", "register-subsystems.ts")
$registeredSubs = @()  # subsystem class names
if (Test-Path $registerPath) {
  $regContent = Get-FileContent $registerPath
  # Extract: new SomeSystem() pattern
  $regMatches = [regex]::Matches($regContent, 'new\s+(\w+)\s*\(')
  foreach ($rm in $regMatches) { $registeredSubs += $rm.Groups[1].Value }
}

# Read the orchestrator responsibility module to extract all delegated method calls
$orchCalls = @{}
if ($orchContent) {
  $callMatches = [regex]::Matches($orchContent, '(?:\w+\.)(\w+)\s*\(')
  foreach ($cm in $callMatches) { $orchCalls[$cm.Groups[1].Value] = $true }
}

# Only check subsystems registered with orchestrator
$subFiles = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts" -File -ErrorAction SilentlyContinue | Where-Object {
  $_.FullName -match '[\\/]subsystems[\\/]' -and $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]'
})

$orphanedMethods = @{}
foreach ($sf in $subFiles) {
  $sfc = Get-FileContent $sf.FullName
  if (-not $sfc) { continue }
  $relSF = $sf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Check if this file contains one of the registered subsystem classes
  $isRegistered = $false
  foreach ($rs in $registeredSubs) {
    if ($sfc -match "\bclass\s+$rs\b") { $isRegistered = $true; break }
  }
  if (-not $isRegistered) { continue }

  # Extract method definitions: look for lines with methodName( at start or after whitespace
  $methodMatches = [regex]::Matches($sfc, '^\s*(?:public\s+|private\s+|protected\s+|async\s+)*(\w+)\s*\(', [System.Text.RegularExpressions.RegexOptions]::Multiline)
  foreach ($mm in $methodMatches) {
    $methodName = $mm.Groups[1].Value
    if ($methodName -eq 'constructor') { continue }
    if ($methodName -match '^_') { continue }
    if ($methodName -in $jsKeywords) { continue }
    if ($methodName.Length -le 1) { continue }

    # ISubSystem interface methods are called indirectly
    if ($methodName -in @('advance', 'applyChanges', 'collectState', 'reset', 'setAIService', 'generateWithAI')) { continue }

    if (-not $orchCalls.ContainsKey($methodName)) {
      $key = "$relSF::$methodName"
      if (-not $orphanedMethods.ContainsKey($key)) {
        $orphanedMethods[$key] = @{ File = $relSF; Method = $methodName }
      }
    }
  }
}

$orphanCount = $orphanedMethods.Count
if ($orphanCount -le 2) {
  foreach ($om in $orphanedMethods.Values) {
    Warn "A6-ORPHAN-METHOD" $om.File "" "Public method '$($om.Method)()' is never called by orchestrator - may be dead code or intended for external use"
  }
} elseif ($orphanCount -gt 0) {
  $byFile = $orphanedMethods.Values | Group-Object -Property File
  foreach ($g in $byFile) {
    $methods = ($g.Group | ForEach-Object { "$($_.Method)()" }) -join ', '
    Warn "A6-ORPHAN-METHOD" $g.Name "" "Found $($g.Count) orphaned methods: $methods - none called by orchestrator (total $orphanCount across all runtime subsystems)"
  }
}

# Also check: registered subsystems whose class can't be found in any file
foreach ($rs in $registeredSubs) {
  $found = $false
  foreach ($sf in $subFiles) {
    $sfc = Get-FileContent $sf.FullName
    if ($sfc -and $sfc -match "\bclass\s+$rs\b") { $found = $true; break }
  }
  if (-not $found) {
    Fail "A6-MISSING-REG" "register-subsystems.ts" "" "Registered subsystem class '$rs' not found in any subsystem file - may be a broken reference"
  }
}

# ============================================================
