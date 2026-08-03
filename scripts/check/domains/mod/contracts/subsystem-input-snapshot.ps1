# Purpose: Validate subsystem input checks and immutable state snapshots.
# Owner: quality:mod
# Responsibility: D21 collectState structuredClone and applyChanges input validation assertions only.

$allSrcFilesD20 = @($AllSrcFiles | Where-Object { $_.Name -notmatch '^(page|layout|loading|error|not-found)\.tsx$' })
# === D21: Function internal logic order verification ===
Write-Host "  [D21] Verifying function internal logic order..." -ForegroundColor DarkGray
# Check subsystem methods for proper logic order (validate -> compute -> return)
foreach ($f in $allSrcFilesD20) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")
  if ($relFP -notmatch 'subsystems/') { continue }

  # Check collectState for structuredClone usage
  if ($fc -match 'collectState\s*\(') {
    $csBody = [regex]::Match($fc, 'collectState\s*\([\s\S]*?\{([\s\S]*?)\n\s*\}')
    if ($csBody.Success) {
      $csContent = $csBody.Groups[1].Value
      # Only flag if collectState reads from store or external mutable data
      $readsFromStore = $csContent -match '(use\w+Store|\.getState\(\)|\w+Store\.|state\.\w+\[)'
      if ($readsFromStore -and $fc -notmatch 'structuredClone') {
        Warn "D21-STRUCT-CLONE" $relFP "" "collectState() should use structuredClone() for immutable state snapshot"
      }
    }
  }

  # Check applyChanges for input validation (subsystem implementation only; match method signature with type annotation)
  if ($fc -match 'applyChanges\s*\(\s*changes\s*:\s*SubSystemChanges') {
    $acBody = [regex]::Match($fc, 'applyChanges\s*\(\s*changes\s*:\s*SubSystemChanges[\s\S]*?\{([\s\S]*?)\n\s*\}')
    if ($acBody.Success) {
      $body = $acBody.Groups[1].Value
      if ($body -notmatch 'if\s*\(!' -and $body -notmatch 'if\s*\([''"]' -and $body -notmatch '\.hasOwnProperty' -and $body -notmatch 'typeof\s+\w+\s*[!=]==') {
        Warn "D21-INPUT-VALID" $relFP "" "applyChanges() should validate input changes before applying (if (!changes) etc.)"
      }
    }
  }
}
