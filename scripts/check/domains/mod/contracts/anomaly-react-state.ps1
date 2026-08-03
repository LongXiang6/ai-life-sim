# Purpose: Detect focused React effect, state, and prop mutation anti-patterns.
# Owner: quality:mod
# Responsibility: A2 async effect/state, missing dependency, and prop mutation assertions only.

# ============================================================
# A2: React anti-patterns (regex-based, no AST)
# ============================================================
Write-Host "  [A2] Checking React anti-patterns..." -ForegroundColor DarkGray

$allTsxFiles = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })

foreach ($f in $allTsxFiles) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # A2a: useEffect with async callback (missing cleanup)
  $asyncEffects = [regex]::Matches($fc, 'useEffect\s*\(\s*async\s*\(')
  foreach ($m in $asyncEffects) {
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
      Warn "A2-ASYNC-EFFECT" $relFP "L$lineNum" "useEffect with async callback without cleanup - may cause memory leaks or stale state"
  }

  # A2b: useState initialized with async value
  $asyncState = [regex]::Matches($fc, 'useState\s*\(\s*await\s')
  foreach ($m in $asyncState) {
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
      Fail "A2-ASYNC-STATE" $relFP "L$lineNum" "useState initialized with await - will never resolve. Use useEffect instead."
  }

  # A2c: useEffect without dependency array (only flag single dependency, ignore empty array or explicit deps)
  $looseEffects = [regex]::Matches($fc, 'useEffect\s*\(\s*\(\s*\)\s*=>\s*\{')
  foreach ($m in $looseEffects) {
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
    # Check if there's a dep array after the callback body
    $afterCallback = $fc.Substring($m.Index)
    if ($afterCallback -match '^\s*useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*\}[^,)]*\s*\)\s*$') {
      Warn "A2-MISSING-DEPS" $relFP "L$lineNum" "useEffect has no dependency array - verify it's intentional (add [] or variable deps)"
    }
  }

  # A2d: Mutation of props
  $propMutations = [regex]::Matches($fc, '\b(prop|props|args)\s*\.\s*\w+\s*=')
  foreach ($m in $propMutations) {
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
      Warn "A2-PROP-MUTATION" $relFP "L$lineNum" "Direct mutation of props/props/args detected - React props should be immutable"
  }
}
