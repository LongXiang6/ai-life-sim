# Purpose: Validate that a MOD index is a named-export public entrypoint.
# Owner: quality:mod
# Responsibility: H1 export-star and non-export logic assertions only.

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName
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
}
