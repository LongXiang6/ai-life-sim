# Purpose: Validate that applyChanges does not read another subsystem Store.
# Owner: quality:mod
# Responsibility: C17 cross-subsystem Store read assertions only.

foreach ($md in $modDirs) {
  $mn = $md.Name
  $subDir = Join-Path $md.FullName "subsystems"
  if (-not (Test-Path $subDir)) { continue }
  $subFiles = @(Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
  foreach ($sf in $subFiles) {
    $sc = Get-FileContent $sf.FullName
    # Find applyChanges method body
    $acMatch = [regex]::Match($sc, 'applyChanges\([\s\S]*?\{([\s\S]*?)\n\s*\}')
    if ($acMatch.Success) {
      $acBody = $acMatch.Groups[1].Value
      # Check for cross-subsystem store reads
      if ($acBody -match 'use\w+Store\s*\(') {
        Warn "C17-CROSS-SUBSYSTEM" "src/mods/${mn}/subsystems/$($sf.Name)" "" "applyChanges() reads another Store, subsystems should only operate on own data"
      }
    }
  }
}
