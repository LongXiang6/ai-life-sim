# Purpose: Validate that Manifest dependency declarations form an acyclic graph.
# Owner: quality:mod
# Responsibility: D3 direct and graph-cycle assertions only.

# Post-pass: D3
#
Write-Host ""
Write-Host "--- Post-pass: D3                    ---" -ForegroundColor Cyan
$modNames = $AllManifests.Keys
foreach ($mn in $modNames) {
  $info = $AllManifests[$mn]
  foreach ($dep in $info.dependencies) {
    if ($AllManifests.ContainsKey($dep) -and $dep -ne $mn) {
      $depInfo = $AllManifests[$dep]
      if ($depInfo.dependencies -contains $mn) {
        Fail "D3-CYCLE" $mn "" "               '$mn'     '$dep'                   "
      }
    }
  }
}
#                             Kahn
$inDegree = @{}
$graph = @{}
foreach ($mn in $modNames) { $inDegree[$mn] = 0; $graph[$mn] = @() }
foreach ($mn in $modNames) {
  $info = $AllManifests[$mn]
  foreach ($dep in $info.dependencies) {
    if ($modNames -contains $dep) {
      $graph[$dep] += $mn  # dep     mn (dep must load before mn)
      $inDegree[$mn]++
    }
  }
}
$queue = [System.Collections.Queue]::new()
foreach ($mn in $modNames) {
  if ($inDegree[$mn] -eq 0) { $queue.Enqueue($mn) }
}
$visited = 0
while ($queue.Count -gt 0) {
  $node = $queue.Dequeue()
  $visited++
  foreach ($neighbor in $graph[$node]) {
    $inDegree[$neighbor]--
    if ($inDegree[$neighbor] -eq 0) { $queue.Enqueue($neighbor) }
  }
}
if ($visited -lt $modNames.Count) {
  $unvisited = $modNames | Where-Object { $inDegree[$_] -gt 0 }
  Fail "D3-CYCLE" "      " "" "                                  $($unvisited -join ', ')                      "
} else {
  Pass "D3-CYCLE" "      " "                              $visited     MOD                   "
}
