# Purpose: Validate project-wide Manifest event emit/listen pairing.
# Owner: quality:mod
# Responsibility: D8 orphaned emit and listen assertions only.

# === D8: Event emit/listen pairing ===
Write-Host "  [D8] Checking event pairing..." -ForegroundColor DarkGray

$allEmits = @{}
$allListens = @{}

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  foreach ($ev in $info.Emits) {
    if (-not $allEmits.ContainsKey($ev)) { $allEmits[$ev] = @() }
    $allEmits[$ev] += $mn
  }
  foreach ($ev in $info.Listens) {
    if (-not $allListens.ContainsKey($ev)) { $allListens[$ev] = @() }
    $allListens[$ev] += $mn
  }
}

foreach ($evt in $allEmits.Keys) {
  if (-not $allListens.ContainsKey($evt)) {
    Warn "D8-ORPHAN-EMIT" ($allEmits[$evt] -join ",") "" "event '$evt' emitted but never listened"
  }
}

foreach ($evt in $allListens.Keys) {
  if (-not $allEmits.ContainsKey($evt)) {
    if ($evt -eq "core:all-mods-loaded") {
      Pass "D8-LISTEN" ($allListens[$evt] -join ",") "listens core:all-mods-loaded (core event by loader)"
    } else {
      Fail "D8-ORPHAN-LISTEN" ($allListens[$evt] -join ",") "" "event '$evt' listened but never emitted"
    }
  }
}
