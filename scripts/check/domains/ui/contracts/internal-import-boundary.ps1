# Purpose: Detect imports that cross another MOD private _internal boundary.
# Owner: quality:ui
# Responsibility: F1 cross-MOD _internal import assertions only.

# ============================================================
# F1: _internal/ directory protection
# ============================================================
Write-Host "  [F1] Checking _internal/ dirs..." -ForegroundColor DarkGray
$allModDirs = @(Get-ChildItem -Path (Join-Path $SrcDir "mods") -Directory | Where-Object { $_.Name -match '^mod-' })
# Pass 1: collect MODs with non-empty _internal/ dirs
$modsWithInternal = @{}
foreach ($md in $allModDirs) {
  $internalDir = Join-Path $md.FullName "_internal"
  if (Test-Path $internalDir) {
    $internalFiles = @(Get-ChildItem -Path $internalDir -Recurse -Filter "*.ts" -File -ErrorAction SilentlyContinue)
    if ($internalFiles.Count -gt 0) {
      $modsWithInternal[$md.Name] = $true
    }
  }
}
# Pass 2: single scan of all src files (skip _internal/ files themselves)
if ($modsWithInternal.Count -gt 0) {
  $allSrcFilesF1 = if ($AllSrcFiles) { $AllSrcFiles } else { @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue) }
  foreach ($sf in $allSrcFilesF1) {
    # skip files inside _internal/ dirs
    if ($sf.FullName -match '[\\/]_internal[\\/]') { continue }
    $sfc = Get-FileContent $sf.FullName
    if (-not $sfc) { continue }
    foreach ($mn in $modsWithInternal.Keys) {
      if ($sfc -match [regex]::Escape("$mn/_internal")) {
        Warn "F1-INTERNAL-LEAK" $sf.Name "" "imports _internal/ from $mn (forbidden)"
      }
    }
  }
}
