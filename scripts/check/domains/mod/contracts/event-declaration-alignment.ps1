# Purpose: Compare MOD eventBus emit calls with Manifest event declarations.
# Owner: quality:mod
# Responsibility: D14 undeclared and unused emitted-event assertions only.

# === D14: emit()/on() event name vs manifest ===
Write-Host "  [D14] Checking emit/listen consistency..." -ForegroundColor DarkGray

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  $modTsFiles = @(Get-ChildItem -Path $info.Path -Recurse -Filter "*.ts" -File -ErrorAction SilentlyContinue)
  $codeEmits = @{}
  $codeListens = @{}
  # Single traversal: collect both emit and listen calls
  foreach ($tf in $modTsFiles) {
    $tc = Get-FileContent $tf.FullName
    if (-not $tc) { continue }
    $emitCalls = [regex]::Matches($tc, "\.emit\('([^']+)'")
    foreach ($ec in $emitCalls) {
      $evtName = $ec.Groups[1].Value
      if ($evtName -notmatch '^mod-') { continue }
      $codeEmits[$evtName] = $tf.Name
    }
    if ($info.Listens.Count -gt 0) {
      $listenCalls = [regex]::Matches($tc, "\.on\('([^']+)'")
      foreach ($lc in $listenCalls) {
        $evtName2 = $lc.Groups[1].Value
        if ($evtName2 -notmatch '^mod-') { continue }
        $codeListens[$evtName2] = $tf.Name
      }
    }
  }
  foreach ($ce in $codeEmits.Keys) {
    if ($ce -notin $info.Emits) {
      Fail "D14-EMIT-UNDECLARED" $mn "" "code emits '$ce' (in $($codeEmits[$ce])) but not declared in manifest.emits"
    }
  }
  foreach ($de in $info.Emits) {
    if (-not $codeEmits.ContainsKey($de)) {
      Warn "D14-EMIT-UNUSED" $mn "" "manifest.emits declares '$de' but no code actually emits it"
    }
  }
  # listens 未使用：子系统 MOD 经 orchestrator.advance 推进，非 eventBus.on() —— 蓝图 Phase 2.3 设计如此，跳过 WARN
}
