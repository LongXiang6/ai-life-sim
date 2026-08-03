# Purpose: Validate MOD Manifest route page references.
# Owner: quality:mod
# Responsibility: D12 route page existence assertions only.

# === D12: Route path resolution ===
Write-Host "  [D12] Checking route paths..." -ForegroundColor DarkGray

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  if ($info.ManContent -notmatch 'routes:\s*\[') { continue }

  $routePattern = "\{\s*path:\s*'([^']+)'\s*,\s*page:\s*'([^']+)'[^}]*\}"
  $routeMatches = [regex]::Matches($info.ManContent, $routePattern)
  foreach ($rm in $routeMatches) {
    $routePath = $rm.Groups[1].Value
    $pageRef = $rm.Groups[2].Value
    $expectedFile1 = [System.IO.Path]::Combine($info.Path, "pages", $pageRef, "page.tsx")
    $expectedFile2 = [System.IO.Path]::Combine($info.Path, "pages", $pageRef, "page.ts")
    if (-not (Test-Path $expectedFile1) -and -not (Test-Path $expectedFile2)) {
      Fail "D12-ROUTE-PAGE" $mn "" "route '$routePath' page '$pageRef' not found: expected pages/$pageRef/page.tsx"
    }
  }
}
