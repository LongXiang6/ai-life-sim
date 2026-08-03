# Purpose: Validate Manifest stores against source, public exports, and global slices.
# Owner: quality:mod
# Responsibility: D10 store file, export, index, and slice wiring assertions only.

# === D10: Store registration chain ===
Write-Host "  [D10] Checking store chain..." -ForegroundColor DarkGray

$globalSlicesPath = Join-Path $SrcDir "core/global-store/slices/index.ts"
$globalSlicesContent = ""
if (Test-Path $globalSlicesPath) {
  $globalSlicesContent = Get-FileContent $globalSlicesPath
}

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  if ($info.Stores.Count -eq 0) { continue }

  $storePath = Join-Path $info.Path "store.ts"

  if (-not (Test-Path $storePath)) {
    Fail "D10-STORE-FILE" $mn "" "manifest declares stores but store.ts missing"
    continue
  }

  $sc = Get-FileContent $storePath

  foreach ($st in $info.Stores) {
    if ($sc -notmatch [regex]::Escape($st)) {
      Fail "D10-STORE-EXPORT" $mn "" "store '$st' not found in store.ts"
    }

    $ic = $info.IndexContent
    if ($ic -and ($ic -notmatch [regex]::Escape($st))) {
      Warn "D10-STORE-INDEX" $mn "" "store '$st' not re-exported in index.ts"
    }
  }

  if ($globalSlicesContent) {
    $anyWired = $false
    foreach ($st in $info.Stores) {
      if ($globalSlicesContent -match [regex]::Escape($st)) {
        $anyWired = $true
        break
      }
    }
    if (-not $anyWired) {
      Warn "D10-STORE-WIRING" $mn "" "stores not wired in core/global-store/slices/index.ts"
    }
  }
}
