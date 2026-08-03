# Purpose: Diagnose legacy MOD tier dependency direction.
# Owner: quality:mod
# Responsibility: D24-SEGMENT-REVERSE advisory assertions only.

# ============================================================
# Post-pass 3: Dependency Direction Check (D24)
# ============================================================
Write-Host ""
Write-Host "--- Post-pass 3: D24 Dependency Direction Check ---" -ForegroundColor Cyan

$loSegments = @(
  @{Name="Engine"; AllowedDeps=@() },
  @{Name="Data"; AllowedDeps=@("Engine") },
  @{Name="World"; AllowedDeps=@("Engine","Data") },
  @{Name="Social"; AllowedDeps=@("Engine","Data","World") },
  @{Name="UI"; AllowedDeps=@("Engine","Data","World","Social") },
  @{Name="Page"; AllowedDeps=@("Engine","Data","World","Social","UI") }
)

foreach ($mn in $AllManifests.Keys) {
  $info = $AllManifests[$mn]
  $myTier = Get-ModTier $mn
  if (-not $myTier) { continue }
  $mySegment = $loSegments | Where-Object { $_.Name -eq $myTier } | Select-Object -First 1
  if (-not $mySegment) { continue }

  foreach ($dep in $info.dependencies) {
    $depName = Resolve-ModDependencyName $dep
    if (-not $AllManifests.ContainsKey($depName)) { continue }
    $depTier = Get-ModTier $depName
    if (-not $depTier) { continue }
    $depSegment = $loSegments | Where-Object { $_.Name -eq $depTier } | Select-Object -First 1
    if (-not $depSegment) { continue }

    if ($mySegment.Name -eq "Engine" -and $depSegment.Name -ne "Engine") {
      Warn "D24-SEGMENT-REVERSE" $mn "" "legacy tier model flags dependency on $($depSegment.Name)-level MOD '$depName'; verify against the active public contract"
    }
    if ($depSegment.Name -notin $mySegment.AllowedDeps -and $depSegment.Name -ne $mySegment.Name) {
      Warn "D24-SEGMENT-REVERSE" $mn "" "legacy tier model flags '$mn' -> '$depName'; current authority only enforces app -> mods -> core -> foundation and public MOD boundaries"
    }
  }
}
