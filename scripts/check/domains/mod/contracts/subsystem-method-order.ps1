# Purpose: Validate the public lifecycle method order of subsystem implementations.
# Owner: quality:mod
# Responsibility: D19 collectState, applyChanges, and reset ordering assertions only.

# === D19: Subsystem method order verification ===
Write-Host "  [D19] Verifying subsystem lifecycle method order..." -ForegroundColor DarkGray
foreach ($md in $modDirs) {
  $mn = $md.Name
  $subDir = Join-Path $md.FullName "subsystems"
  if (-not (Test-Path $subDir)) { continue }
  $subFiles = @(Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
  foreach ($sf in $subFiles) {
    $sc = Get-FileContent $sf.FullName
    if (-not $sc) { continue }
    if ($sc -notmatch '(implements\s+ISubSystem\b|extends\s+BaseSubsystem\b)') { continue }
    $relFP = "src/mods/${mn}/subsystems/$($sf.Name)"
    $result = Test-FunctionOrder $sc $relFP @("collectState", "applyChanges", "reset") "subsystem"
    if (-not $result.AllFound) {
      Fail "D19-METHOD-ORDER" $relFP "" "subsystem implementation missing required method: $($result.MissingMethod)"
    } elseif ($result.OrderBroken) {
      Fail "D19-METHOD-ORDER" $relFP "" "'$($result.OutOfOrder)' appears out of order. Expected: collectState -> applyChanges -> reset"
    } else {
      Pass "D19-METHOD-ORDER" $relFP "subsystem methods in correct order: collectState -> applyChanges -> reset"
    }
  }
}
