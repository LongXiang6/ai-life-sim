# Purpose: Validate declared PromptTemplate structure and variable projection.
# Owner: quality:mod
# Responsibility: E1 and E2 prompt template assertions only.

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName
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
}
