# Purpose: Detect undefined CSS custom-property usages against generated and standard token prefixes.
# Owner: UI static analysis
# Responsibility: S26 whitelist construction, usage classification, and result reporting only.

Write-Host ""
Write-Host "  [S26] Intelligent CSS variable name validation (whitelist-based)..." -ForegroundColor Cyan

$s26StartErrors = $E.Errors
$s26StartWarnings = $E.Warnings

$tokenDir = Join-Path $SrcDir "foundation\tokens"
$definedVars = @{}
$validPrefixes = @{}

if (Test-Path $tokenDir) {
  $tokenFiles = @(Get-ChildItem -Path $tokenDir -Recurse -Include "*.css" -File -ErrorAction SilentlyContinue)
  foreach ($tf in $tokenFiles) {
    $tc = Get-FileContent $tf.FullName
    if (-not $tc) { continue }
    $tlines = $tc -split "`n"
    foreach ($tl in $tlines) {
      if ($tl -match '^\s*(--[\w-]+)\s*:') {
        $varName = $Matches[1]
        $definedVars[$varName] = $true
        if ($varName -match '^(--[a-z]+-).+') {
          $validPrefixes[$Matches[1]] = $true
        }
      }
    }
  }
}

$standardPrefixes = @(
  '--color-', '--font-', '--spacing-', '--radius-',
  '--shadow-', '--duration-', '--ease-', '--z-',
  '--breakpoint-', '--text-on-', '--font-weight-',
  '--font-size-', '--font-family-'
)
foreach ($sp in $standardPrefixes) {
  $validPrefixes[$sp] = $true
}

$prefixCount = $validPrefixes.Count
$varCount = $definedVars.Count
$allSrcFilesS26 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.css","*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })
$suspiciousVars = @{}

foreach ($f in $allSrcFilesS26) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  $varMatches = [regex]::Matches($fc, 'var\(\s*(--[\w-]+)')
  foreach ($vm in $varMatches) {
    $varName = $vm.Groups[1].Value
    if ($deprecatedVars.ContainsKey($varName)) { continue }
    if ($definedVars.ContainsKey($varName)) { continue }

    $remainingLength = [Math]::Min(256, $fc.Length - $vm.Index)
    $usageSnippet = $fc.Substring($vm.Index, $remainingLength)
    if ($usageSnippet -match ('^var\(\s*' + [regex]::Escape($varName) + '\s*,')) { continue }

    $hasLocalDefinition = $false
    if ($cssVarDefs.ContainsKey($varName)) {
      foreach ($definition in $cssVarDefs[$varName]) {
        if ($definition.StartsWith("${relFP}:")) {
          $hasLocalDefinition = $true
          break
        }
      }
    }
    if ($hasLocalDefinition) { continue }
    if ($tsCssVars.ContainsKey($varName)) { continue }

    $hasValidPrefix = $false
    foreach ($prefix in $validPrefixes.Keys) {
      if ($varName.StartsWith($prefix)) { $hasValidPrefix = $true; break }
    }
    if ($hasValidPrefix) { continue }

    if (-not $suspiciousVars.ContainsKey($varName)) {
      $suspiciousVars[$varName] = @{ Files = @{}; TotalCount = 0 }
    }
    $suspiciousVars[$varName].Files[$relFP] = $true
    $suspiciousVars[$varName].TotalCount++
  }
}

foreach ($sv in $suspiciousVars.Keys) {
  $info = $suspiciousVars[$sv]
  $fileCount = $info.Files.Count
  $sampleFiles = ($info.Files.Keys | Select-Object -First 3) -join ', '

  if ($fileCount -ge 5) {
    Warn "S26-UNKNOWN-CSS-VAR" $sampleFiles "" "CSS variable 'var(${sv})' used in $fileCount files but not found in Design Tokens. Consider adding to tokens or using a standard variable."
  } elseif ($fileCount -ge 2) {
    Warn "S26-UNKNOWN-CSS-VAR" $sampleFiles "" "CSS variable 'var(${sv})' used in $fileCount files but undefined. Possible typo or legacy variable."
  } else {
    Fail "S26-UNKNOWN-CSS-VAR" $sampleFiles "" "CSS variable 'var(${sv})' used in 1 file with no definition. Likely typo or deprecated variable - remove or define in Design Tokens."
  }
}

$s26Errors = $E.Errors - $s26StartErrors
$s26Warnings = $E.Warnings - $s26StartWarnings
Write-Host "  S26-UNKNOWN-CSS-VAR: $s26Errors errors, $s26Warnings warnings (whitelist: $varCount vars, $prefixCount prefixes)" -ForegroundColor $(if ($s26Errors -gt 0) { "Red" } elseif ($s26Warnings -gt 0) { "Yellow" } else { "Green" })
