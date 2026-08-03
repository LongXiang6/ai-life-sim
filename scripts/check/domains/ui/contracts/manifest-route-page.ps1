# Purpose: Validate exact Manifest route page references owned by the UI domain.
# Owner: quality:ui
# Responsibility: D32 route page existence assertions only.

# === D32: Check route page files exist ===
Write-Host "  [D32] Checking route page files exist..." -ForegroundColor DarkGray
$d32StartErrors = $E.Errors
$d32StartWarnings = $E.Warnings
foreach ($md in $modDirs) {
  $mn = $md.Name
  $manifestPath = Join-Path $md.FullName "manifest.ts"
  if (-not (Test-Path $manifestPath)) { continue }
  $mfContent = Get-FileContent $manifestPath
  if (-not $mfContent) { continue }

  $routeMatches = [regex]::Matches($mfContent, "\{\s*path:\s*'([^']+)'\s*,\s*page:\s*'([^']+)'\s*\}")
  foreach ($rm in $routeMatches) {
    $routePath = $rm.Groups[1].Value
    $pageName = $rm.Groups[2].Value
    $expectedPageFile = Join-Path $md.FullName "pages/$pageName/page.tsx"
    if (-not (Test-Path $expectedPageFile)) {
      Fail "D32-ROUTE-PAGE" "src/mods/${mn}/manifest.ts" "" "Route '$routePath' references page '$pageName' but pages/$pageName/page.tsx does not exist"
    }
  }
}
$d32Errors = $E.Errors - $d32StartErrors
$d32Warnings = $E.Warnings - $d32StartWarnings
Write-Host "  D32-ROUTE-PAGE : $d32Errors errors, $d32Warnings warnings" -ForegroundColor $(if ($d32Errors -gt 0) { "Red" } elseif ($d32Warnings -gt 0) { "Yellow" } else { "Green" })
