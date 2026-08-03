# Purpose: Validate Manifest provides and consumes capability wiring.
# Owner: quality:mod
# Responsibility: D9 provider existence, dependency, namespace, and public export assertions only.

# === D9: provides/consumes consistency ===
Write-Host "  [D9] Checking provides/consumes..." -ForegroundColor DarkGray

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]

  if ($info.Consumes.Count -gt 0) {
    foreach ($cap in $info.Consumes) {
      # 内联搜索 provider（避免 PowerShell 哈希表在 dot-source 链中的赋值失效 bug）
      $provider = $null
      foreach ($otherMn in $AllModInfo.Keys) {
        if ($cap -in $AllModInfo[$otherMn].Provides) {
          $provider = $otherMn
          break
        }
      }
      if (-not $provider) {
        Fail "D9-CONSUME" $mn "" "consumes '$cap' not provided by any MOD in registry"
        continue
      }
      $resolvedDeps = @($info.Deps | ForEach-Object { Resolve-ModDependencyName $_ })
      if ($provider -notin $resolvedDeps) {
        Warn "D9-CONSUME-DEP" $mn "" "consumes '$cap' from '$provider' but no dependency on provider - add '~ $provider' or hard dependency"
      }
    }
  }

  if ($info.Provides.Count -gt 0) {
    $ic = $info.IndexContent
    $modShort = $mn -replace '^mod-', ''
    foreach ($cap in $info.Provides) {
      $inSubsystem = $cap -in $info.SubsystemIds
      $inNamespace = ($cap -eq $modShort) -or ($cap -like "$modShort-*")
      $inIndex = $ic -and ($ic -match [regex]::Escape($cap))
      $consumedByAnotherMod = @($AllModInfo.Values | Where-Object { $cap -in $_.Consumes }).Count -gt 0
      if (-not $inSubsystem -and -not $inNamespace -and -not $inIndex -and -not $consumedByAnotherMod) {
        Fail "D9-PROVIDE" $mn "" "provides '$cap' not matched by subsystem id, mod namespace '$modShort', or index.ts export"
      }
    }
  }
}
