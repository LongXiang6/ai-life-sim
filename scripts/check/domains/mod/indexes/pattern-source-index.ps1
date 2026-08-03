# Purpose: Build one cached index of MOD pattern source files and declared pattern IDs.
# Owner: quality:mod
# Responsibility: Project pattern file content, relative paths, and ID literals only.

$PatternSourceRecords = [System.Collections.ArrayList]::new()
foreach ($modDirectory in $modDirs) {
  $patternsDirectory = Join-Path $modDirectory.FullName 'patterns'
  if (-not (Test-Path $patternsDirectory)) { continue }
  foreach ($patternFile in @(Get-ChildItem -LiteralPath $patternsDirectory -Filter '*-patterns.ts' -File -ErrorAction SilentlyContinue)) {
    $content = Get-FileContent $patternFile.FullName
    if (-not $content) { continue }
    $ids = @(
      [regex]::Matches($content, '(?:id|patternId)\s*[=:]\s*[''"]([^''"]+)[''"]') |
        ForEach-Object { $_.Groups[1].Value }
    )
    [void]$PatternSourceRecords.Add([pscustomobject]@{
      ModName = $modDirectory.Name
      File = $patternFile
      RelativePath = "src/mods/$($modDirectory.Name)/patterns/$($patternFile.Name)"
      Content = $content
      Ids = $ids
    })
  }
}
