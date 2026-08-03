# Purpose: Validate that prompt source files remain PromptTemplate-oriented.
# Owner: quality:mod
# Responsibility: G10 exported type and class assertions only.

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
