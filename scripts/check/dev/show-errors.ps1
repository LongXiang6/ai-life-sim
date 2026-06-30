$latest = Get-ChildItem "reports\checker-*.json" | Sort LastWriteTime -Desc | Select -First 1
$json = Get-Content $latest.FullName -Raw | ConvertFrom-Json

Write-Host "FAIL: $($json.Summary.TotalErrors)  WARN: $($json.Summary.TotalWarnings)  OK: $($json.Summary.TotalPass)"
Write-Host ""

Write-Host "=== Unique TSC Errors ==="
$json.Results | Where-Object { $_.Rule -eq 'T1-TSC-ERROR' } | Group-Object File,Message | ForEach-Object {
  $first = $_.Group | Select -First 1
  Write-Host "  [$($_.Count)x] $($first.File) - $($first.Message)"
}

Write-Host ""
Write-Host "=== Other FAIL ==="
$json.Results | Where-Object { $_.Level -eq 'ERROR' -and $_.Rule -ne 'T1-TSC-ERROR' } | Group-Object Rule | ForEach-Object {
  $first = $_.Group | Select -First 1
  Write-Host "  [$($_.Count)x] $($first.Rule) - $($first.File) - $($first.Message)"
}
