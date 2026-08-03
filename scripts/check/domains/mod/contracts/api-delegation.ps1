# Purpose: Validate application API delegates that target MOD API files.
# Owner: quality:mod
# Responsibility: D13 delegated API file existence assertions only.

# === D13: API delegation chain ===
Write-Host "  [D13] Checking API chain..." -ForegroundColor DarkGray

$appApiDir = Join-Path $SrcDir "app/api"
if (Test-Path $appApiDir) {
  $appRoutes = @(Get-ChildItem -Path $appApiDir -Directory -ErrorAction SilentlyContinue)
  foreach ($ar in $appRoutes) {
    $routeFile = Join-Path $ar.FullName "route.ts"
    if (-not (Test-Path $routeFile)) { continue }
    $rc = Get-FileContent $routeFile
    $delegateMatch = [regex]::Match($rc, "from\s+'@/mods/(mod-[a-z0-9-]+)/api/([^']+)'")
    if ($delegateMatch.Success) {
      $targetMod = $delegateMatch.Groups[1].Value
      $targetFile = $delegateMatch.Groups[2].Value
      $modApiPath = [System.IO.Path]::Combine($SrcDir, "mods", $targetMod, "api", $targetFile)
      if (-not (Test-Path $modApiPath)) {
        Fail "D13-API-DELEGATE" $ar.Name "" "API delegate points to @/mods/$targetMod/api/$targetFile but file not found"
      }
    }
  }
}
