# Purpose: Validate source file and exported function JSDoc completeness.
# Owner: quality:mod
# Responsibility: D20 module, description, MOD, parameter, and return documentation assertions only.

# === D20: File header completeness verification ===
Write-Host "  [D20] Verifying JSDoc header completeness..." -ForegroundColor DarkGray
$allSrcFilesD20 = @($AllSrcFiles | Where-Object { $_.Name -notmatch '^(page|layout|loading|error|not-found)\.tsx$' })
foreach ($f in $allSrcFilesD20) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Check file header has JSDoc with @module, @description
  $firstComment = [regex]::Match($fc, "/\*\*([\s\S]*?)\*/")
  if ($firstComment.Success) {
    $comment = $firstComment.Groups[1].Value
    if ($comment -notmatch '@module\s+\S') {
      Warn "D20-JSDOC-MODULE" $relFP "" "File header JSDoc missing @module tag"
    }
    if ($comment -notmatch '@description\s+\S') {
      Warn "D20-JSDOC-MODULE" $relFP "" "File header JSDoc missing @description tag"
    }
    if ($relFP -match '^src/mods/' -and $comment -notmatch '@mod\s+\S') {
      Warn "D20-JSDOC-MODULE" $relFP "" "MOD file header JSDoc missing @mod tag"
    }
  } elseif ($fc -match "^\s*(?:'use client'|import)" -and $f.Name -notmatch "\.(test|spec)\.tsx?$" -and $fc -notmatch '^\s*//') {
    Warn "D20-JSDOC-MODULE" $relFP "" "File missing JSDoc header comment block"
  }

  # Check exported functions have @param/@returns
  $jsDocIssues = Test-JsDocCompleteness $fc $relFP
  foreach ($issue in $jsDocIssues) {
    Warn "D20-JSDOC-FUNC" $relFP "" $issue
  }
}
