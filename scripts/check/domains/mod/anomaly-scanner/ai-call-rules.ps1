# Purpose: Detect AI call sites that fail to forward the player API key.
# Owner: quality:mod
# Responsibility: A9 anomaly rule only.

# A9: AI call sites missing apiKey option
#    Detects external callAI/callAIStream/callAIStreamDegraded/callAIDegraded calls.
#    The owned ai-client implementation forwards typed options and has focused proxy contract tests.
#    Without apiKey, user-entered custom API key (from Settings)
#    never reaches /api/proxy → always 500 "API Key 未配置".
#
#    NOTE: Skips this.callAI(pattern) — these use injected AI service
#    via setAIService(), where apiKey is passed at the injection site
#    (e.g. world-init-bundle.ts's createAIService).
#
#    Spread-forwarding aware: apiKey counts as present when the options
#    argument spreads (or is) a variable that forwards apiKey, e.g.
#      const streamOpts = { ..., apiKey: customKey }; callAIDegraded(m, fb, streamOpts)
#      const { ...restOptions } = options; const commonOpts = { ...restOptions }; callAI(s, u, commonOpts)
#    Such "carrier" identifiers are traced per file so thin wrappers /
#    pre-built option objects are not falsely flagged.
# ============================================================
Write-Host "  [A9] Checking AI call sites for missing apiKey..." -ForegroundColor DarkGray

$aiCallFuncs = @('callAI', 'callAIStream', 'callAIStreamDegraded', 'callAIDegraded')
$allSrcFilesA9 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)([\\/]|$)' -and $_.FullName -notmatch '[\\/]core[\\/]ai-service[\\/]ai-client(?:\.ts|[\\/])' })

foreach ($f in $allSrcFilesA9) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Skip files that use injected AI service via setAIService()
  # (apiKey is passed at injection site, not inside the subsystem)
  if ($fc -match 'setAIService\s*\(') { continue }

  $lines = $fc -split "`n"

  # --- Build set of identifiers that forward apiKey (spread-forwarding detection) ---
  # A variable "carries" apiKey if:
  #   (1) it is a rest capture from object destructuring: const { a, ...rest } = opts  → rest
  #   (2) it is assigned an object literal that contains a literal `apiKey` field
  #   (3) it is assigned an object literal that spreads another carrier: { ...carrier }
  #   (4) it is aliased directly from another carrier: const x = carrier
  # Passes repeat to resolve transitive (3)/(4) chains.
  $carriers = New-Object System.Collections.Generic.HashSet[string]

  # Rule (1): rest captures from object destructuring
  foreach ($m in [regex]::Matches($fc, '\.\.\.(\w+)\s*\}\s*=')) {
    [void]$carriers.Add($m.Groups[1].Value)
  }

  # Collect variable assignments: object literals (with body text) and direct aliases
  $assignments = @()
  for ($si = 0; $si -lt $lines.Count; $si++) {
    if ($lines[$si] -match '(?:const|let|var)\s+(\w+)\s*=\s*\{') {
      $name = $Matches[1]
      $depth = 0
      $started = $false
      $body = ''
      for ($sj = $si; $sj -lt $lines.Count; $sj++) {
        $t = $lines[$sj]
        $body += $t + "`n"
        $opens = ([regex]::Matches($t, '\{')).Count
        $closes = ([regex]::Matches($t, '\}')).Count
        $depth += $opens - $closes
        if ($opens -gt 0) { $started = $true }
        if ($started -and $depth -le 0) { break }
      }
      $assignments += @{ Name = $name; Body = $body }
    }
    elseif ($lines[$si] -match '(?:const|let|var)\s+(\w+)\s*=\s*(\w+)\s*;?\s*$') {
      $assignments += @{ Name = $Matches[1]; Alias = $Matches[2] }
    }
  }

  # Transitive resolution (rules 2/3/4)
  for ($pass = 0; $pass -lt 4; $pass++) {
    $changed = $false
    foreach ($a in $assignments) {
      if ($carriers.Contains($a.Name)) { continue }
      $isCarrier = $false
      if ($a.ContainsKey('Alias')) {
        if ($carriers.Contains($a.Alias)) { $isCarrier = $true }
      }
      else {
        $b = $a.Body
        if ($b -match '\bapiKey\b') { $isCarrier = $true }
        else {
          foreach ($sp in [regex]::Matches($b, '\.\.\.(\w+)')) {
            if ($carriers.Contains($sp.Groups[1].Value)) { $isCarrier = $true; break }
          }
        }
      }
      if ($isCarrier) { [void]$carriers.Add($a.Name); $changed = $true }
    }
    if (-not $changed) { break }
  }

  for ($li = 0; $li -lt $lines.Count; $li++) {
    $line = $lines[$li]
    # Skip this.callAI() — injected AI service, apiKey handled at injection site
    if ($line -match 'this\.(callAI|callAIStream)') { continue }
    # Match: callAI(..., or callAIStream(..., etc.
    if ($line -notmatch '(callAI|callAIStream|callAIStreamDegraded|callAIDegraded)\s*\(') { continue }
    $callName = $Matches[1]

    # Build the call's argument region, bounded by paren depth (max 20 lines)
    $cm = [regex]::Match($line, "$([regex]::Escape($callName))\s*\(")
    $segment = if ($cm.Success) { $line.Substring($cm.Index) } else { $line }
    $regionText = $segment
    $foundApiKey = ($segment -match '\bapiKey\b')
    $depth = ([regex]::Matches($segment, '\(')).Count - ([regex]::Matches($segment, '\)')).Count
    $closed = ($depth -le 0)

    $lookAhead = [Math]::Min($li + 20, $lines.Count - 1)
    for ($lj = $li + 1; (-not $closed) -and $lj -le $lookAhead; $lj++) {
      $nextLine = $lines[$lj]
      $regionText += "`n" + $nextLine
      if ($nextLine -match '\bapiKey\b') { $foundApiKey = $true }
      $depth += ([regex]::Matches($nextLine, '\(')).Count - ([regex]::Matches($nextLine, '\)')).Count
      if ($depth -le 0) { $closed = $true }
    }

    # Spread-forwarding: options region spreads a known apiKey carrier
    if (-not $foundApiKey) {
      foreach ($sp in [regex]::Matches($regionText, '\.\.\.(\w+)')) {
        if ($carriers.Contains($sp.Groups[1].Value)) { $foundApiKey = $true; break }
      }
    }
    # Bare-identifier options arg that is a known carrier (e.g. callAIDegraded(msgs, fb, streamOpts))
    if (-not $foundApiKey) {
      foreach ($c in $carriers) {
        if ($regionText -match "\b$([regex]::Escape($c))\b") { $foundApiKey = $true; break }
      }
    }

    if (-not $foundApiKey) {
        Fail "A9-MISSING-APIKEY" $relFP "L$($li+1)" "$callName() called without apiKey option - user's custom API key will never reach /api/proxy, always 500"
    }
  }
}

$anom2Errors = $E.Errors - $anomStartErrors - $anomErrors
$anom2Warnings = $E.Warnings - $anomStartWarnings - $anomWarnings

# ============================================================
