# Purpose: Detect exported lifecycle functions that are unreachable from loading or runtime flows.
# Owner: quality:mod
# Responsibility: A10 exported function wiring assertions only.

# A10: Exported lifecycle functions never called in loading flow
#      Detects functions exported from core/mod-loader/, core/store-migration/,
#      core/instrument/ that should be wired into the app loading chain
#      (init-mods.tsx or internal callers in the loading modules)
# ============================================================
Write-Host "  [A10] Checking lifecycle exports for wiring gaps..." -ForegroundColor DarkGray

$a10StartErrors = $E.Errors
$a10StartWarnings = $E.Warnings

# Loading chain files — functions should appear in at least one of these
$loadingChainPaths = @(
  Join-Path $SrcDir "app\_components\init-mods.tsx"
  Join-Path $SrcDir "app\_components\init-mods-routes.ts"
  Join-Path $SrcDir "app\_components\init-mods-bootstrap.ts"
  Join-Path $SrcDir "core\mod-loader\mod-loader.ts"
  Join-Path $SrcDir "core\mod-loader\mod-lifecycle.ts"
  Join-Path $SrcDir "core\mod-loader\mod-validator.ts"
  Join-Path $SrcDir "core\mod-loader\dependency-resolver.ts"
  Join-Path $SrcDir "core\mod-loader\mod-registry.ts"
  Join-Path $SrcDir "core\mod-loader\settings-stage.ts"
)

$loadingChainFiles = @(foreach ($p in $loadingChainPaths) { if (Test-Path $p) { $p } })

# Preload loading chain content
$loadingChainContent = @()
foreach ($p in $loadingChainFiles) {
  $c = Get-FileContent $p
  if ($c) { $loadingChainContent += $c }
}
$loadingChainAll = $loadingChainContent -join "`n"

# Preload all core/foundation .ts files for cross-directory caller search
# (e.g., isLikelyRemoteApiExport in core/mod-loader/ called by core/remote-interface/)
$coreAndFoundationPaths = @(Get-ChildItem -Path "$SrcDir\core", "$SrcDir\foundation" -Recurse -Include "*.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'index.ts' -and $_.Name -notmatch '\.generated\.ts$' })
$coreAndFoundationContent = @{}
foreach ($fp in $coreAndFoundationPaths) {
  $c = Get-FileContent $fp.FullName
  if ($c) { $coreAndFoundationContent[$fp.FullName] = $c }
}

# Scan directories for exported functions
$checkedDirs = @(
  "$SrcDir\core\mod-loader"
  "$SrcDir\core\store-migration"
  "$SrcDir\core\instrument"
)

# Known false positives — dev tools, runtime-only APIs, or lower-level utilities
# not meant to be directly wired into the loading flow
$knownDevTools = @(
  'enableInstrumentMode', 'disableInstrumentMode', 'defineMod', 'ENGINE_FEATURE_FLAGS',
  # autoMigrate is the lower-level explicit-chain API; autoMigrateFromDir is the wired entry point
  'autoMigrate',
  'reportRemoteContractIssues'
)

$checkedFiles = @(Get-ChildItem -Path $checkedDirs -Recurse -Include "*.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'index.ts' })

foreach ($cf in $checkedFiles) {
  if ($cf.Name -match '\.generated\.ts$') { continue }
  $cfContent = Get-FileContent $cf.FullName
  if (-not $cfContent) { continue }
  $relFP = $cf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Extract: export function FUNC | export async function FUNC | export const FUNC =
  $funcMatches = [regex]::Matches($cfContent, 'export\s+(?:async\s+)?(?:function|const)\s+(\w+)')
  foreach ($fm in $funcMatches) {
    $funcName = $fm.Groups[1].Value
    if ($funcName -in $knownDevTools) { continue }
    # Skip type-only exports and constants that start with lowercase
    if ($funcName -cmatch '^[a-z]' -and $cfContent -notmatch "export\s+(?:async\s+)?function\s+$funcName\b") { continue }
    # Skip interfaces and types (const with : that is type)
    if ($cfContent -match "const\s+$funcName\s*:\s*\w+\[\]") { continue }

    # Check if called in loading chain (as FUNC( pattern)
    if ($loadingChainAll -match "\b$funcName\s*\(") { continue }

    # Also check within the same directory (internal callers, e.g. parseDependency called by resolveDependenciesV2)
    $sameDirFiles = @(Get-ChildItem -Path (Split-Path $cf.FullName -Parent) -Include "*.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -ne $cf.FullName })
    $foundInternal = $false
    foreach ($sdf in $sameDirFiles) {
      $sdfContent = Get-FileContent $sdf.FullName
      if ($sdfContent -and $sdfContent -match "\b$funcName\s*\(") {
        $foundInternal = $true
        break
      }
    }
    if ($foundInternal) { continue }

    # Check in orchestrator (for instrument hooks)
    $orchPath = Join-Path $SrcDir "mods\mod-engine\subsystems\orchestrator-system.ts"
    if (Test-Path $orchPath) {
      $orchC = Get-ModuleResponsibilityContent $orchPath
      if ($orchC -and $orchC -match "\b$funcName\s*\(") { continue }
    }

    # Check in all core/foundation files outside the current directory
    # (e.g., remote-api-filter.ts called by remote-interface.ts)
    $foundCrossDir = $false
    foreach ($fp2 in $coreAndFoundationPaths) {
      if ($fp2.FullName -eq $cf.FullName) { continue }
      # Skip same-directory files (already checked above)
      if ((Split-Path $fp2.FullName -Parent) -eq (Split-Path $cf.FullName -Parent)) { continue }
      $fpContent = $coreAndFoundationContent[$fp2.FullName]
      if ($fpContent -and $fpContent -match "\b$funcName\s*\(") {
        $foundCrossDir = $true
        break
      }
    }
    if ($foundCrossDir) { continue }

    Fail "A10-UNWIRED-EXPORT" $relFP "" "Exported function '$funcName()' is defined but never called in loading flow, same MOD, core/, foundation/, or orchestrator. May be dead code or missing wiring."
  }
}
