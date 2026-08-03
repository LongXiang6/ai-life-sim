# Purpose: Run CSS alias, variable consistency, deprecation, and token-definition checks.
# Owner: UI static analysis
# Responsibility: CSS-oriented source scanning only; shared reporting is provided by checker-utils.ps1.

Write-Host ""
Write-Host "                                   " -ForegroundColor Cyan

# === S16 (CSS TS alias) merged into S24 CSS scan below ===
# === S24: CSS Variable Consistency Check ===

# S16 error tracking (pre-merged for unified pass)
$cssStartErrors = $E.Errors
$cssStartWarnings = $E.Warnings

# S24 error tracking
$s24StartErrors = $cssStartErrors
$s24StartWarnings = $cssStartWarnings

# Step 1: Collect CSS variables SET by TypeScript (setProperty / style={{}})
$tsCssVars = @{}
$allSrcFilesS24 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })
foreach ($f in $allSrcFilesS24) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  $spMatches = [regex]::Matches($fc, "setProperty\s*\(\s*['""](--[\w-]+)['""]")
  foreach ($m in $spMatches) {
    $varName = $m.Groups[1].Value
    if (-not $tsCssVars.ContainsKey($varName)) {
      $tsCssVars[$varName] = @()
    }
    $tsCssVars[$varName] += $relFP
  }

  $styleMatches = [regex]::Matches($fc, "style=\{\{[^}]*?['""](--[\w-]+)['""]\s*:")
  foreach ($m in $styleMatches) {
    $varName = $m.Groups[1].Value
    if (-not $tsCssVars.ContainsKey($varName)) {
      $tsCssVars[$varName] = @()
    }
    $tsCssVars[$varName] += $relFP
  }
}

# Step 2: Collect CSS variables DEFINED and USED in CSS files
$cssVarDefs = @{}
$cssVarUsages = @{}
$cssFilesS24 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.css" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })
foreach ($cf in $cssFilesS24) {
  $cc = Get-FileContent $cf.FullName
  if (-not $cc) { continue }
  $relFP = $cf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  $varUsageMatches = [regex]::Matches($cc, 'var\(\s*(--[\w-]+)')
  foreach ($vm in $varUsageMatches) {
    $varName = $vm.Groups[1].Value
    if (-not $cssVarUsages.ContainsKey($varName)) {
      $cssVarUsages[$varName] = @()
    }
    $cssVarUsages[$varName] += $relFP
  }

  $lines = $cc -split "`n"
  for ($li = 0; $li -lt $lines.Count; $li++) {
    if ($lines[$li] -match '^\s*(--[\w-]+)\s*:') {
      $defName = $Matches[1]
      if (-not $cssVarDefs.ContainsKey($defName)) {
        $cssVarDefs[$defName] = @()
      }
      $cssVarDefs[$defName] += "${relFP}:L$($li + 1)"
    }

    # === S16 (merged): CSS TS @/* path alias check ===
    if ($lines[$li] -match "@import\s+['`"]@/") {
      Fail "S16-CSS-PATH" $relFP "L$($li + 1)" "CSS @import does not support TS @/* aliases. Use relative path instead (e.g. '../foundation/tokens/index.css')"
    }
    if ($lines[$li] -match "url\s*\(\s*['`"]@/") {
      Fail "S16-CSS-PATH" $relFP "L$($li + 1)" "CSS url() does not support TS @/* aliases. Use relative path instead (e.g. '../assets/bg.png')"
    }
  }
}

# S16 error report (checks merged into S24 CSS scan above)
$cssErrors = $E.Errors - $cssStartErrors
$cssWarnings = $E.Warnings - $cssStartWarnings
Write-Host "  S16-CSS-PATH: $cssErrors        , $cssWarnings " -ForegroundColor $(if ($cssErrors -gt 0) { "Red" } else { "Green" })

# Step 3: Cross-check
foreach ($tsVar in $tsCssVars.Keys) {
  if (-not $cssVarUsages.ContainsKey($tsVar)) {
    $files = ($tsCssVars[$tsVar] | Select-Object -First 3) -join ', '
    Warn "S24-CSS-VAR-ORPHAN" $files "" "TS sets '${tsVar}' but no CSS file consumes it via var(${tsVar})"
  }
}

foreach ($cssVar in $cssVarUsages.Keys) {
  $definedInCss = $cssVarDefs.ContainsKey($cssVar)
  $setByTs = $tsCssVars.ContainsKey($cssVar)
  if (-not $definedInCss -and -not $setByTs) {
    $files = ($cssVarUsages[$cssVar] | Select-Object -First 3) -join ', '
    Warn "S24-CSS-VAR-UNDEFINED" $files "" "CSS uses var(${cssVar}) but it is never defined in any CSS file or set by TypeScript"
  }
}

# Typo detection: similar variable names
$allCssVars = @($cssVarDefs.Keys) + @($tsCssVars.Keys | Where-Object { $_ -notin $cssVarDefs.Keys })
$checkedPairs = @{}
foreach ($v in $allCssVars) {
  if ($checkedPairs.ContainsKey($v)) { continue }
  foreach ($v2 in $allCssVars) {
    if ($v -eq $v2) { continue }
    if ($checkedPairs.ContainsKey($v2)) { continue }
    $diff = $false
    if ($v2.StartsWith($v) -and $v2.Length -gt $v.Length) {
      $suffix = $v2.Substring($v.Length)
      if ($suffix -match '^-[a-z-]+$') { $diff = $true }
    } elseif ($v.StartsWith($v2) -and $v.Length -gt $v2.Length) {
      $suffix = $v.Substring($v2.Length)
      if ($suffix -match '^-[a-z-]+$') { $diff = $true }
    }
    if ($diff) {
      $longer = if ($v.Length -gt $v2.Length) { $v } else { $v2 }
      $shorter = if ($v.Length -gt $v2.Length) { $v2 } else { $v }
      $suffix = $longer.Substring($shorter.Length)
      $knownSuffixes = @(
        '-light', '-dark', '-hover', '-focus', '-active', '-disabled',
        '-primary', '-secondary', '-tertiary',
        '-bg', '-text', '-border', '-shadow', '-surface',
        '-sm', '-md', '-lg', '-xl',
        '-fast', '-normal', '-slow', '-default',
        '-on-primary', '-on-accent', '-on-bg', '-on-surface',
        '-min', '-max',
        '-sans', '-serif', '-mono'
      )
      if ($suffix -notin $knownSuffixes) {
        $loc1 = if ($cssVarDefs.ContainsKey($v)) { ($cssVarDefs[$v] | Select-Object -First 1) } elseif ($tsCssVars.ContainsKey($v)) { ($tsCssVars[$v] | Select-Object -First 1) } else { "unknown" }
        $loc2 = if ($cssVarDefs.ContainsKey($v2)) { ($cssVarDefs[$v2] | Select-Object -First 1) } elseif ($tsCssVars.ContainsKey($v2)) { ($tsCssVars[$v2] | Select-Object -First 1) } else { "unknown" }
        Warn "S24-CSS-VAR-SIMILAR" $loc1 "" "Similar CSS variables found: '${v}' and '${v2}' - verify they are not typos of each other (see also: $loc2)"
      }
      $checkedPairs[$v] = $true
      $checkedPairs[$v2] = $true
      break
    }
  }
}

$s24Errors = $E.Errors - $s24StartErrors
$s24Warnings = $E.Warnings - $s24StartWarnings
Write-Host "  S24-CSS-VAR: $s24Errors errors, $s24Warnings warnings (TS vars: $($tsCssVars.Count), CSS defs: $($cssVarDefs.Count), CSS usages: $($cssVarUsages.Count))" -ForegroundColor $(if ($s24Errors -gt 0) { "Red" } elseif ($s24Warnings -gt 0) { "Yellow" } else { "Green" })

# === S25: Deprecated CSS variable name detection ===
Write-Host ""
Write-Host "  [S25] Checking for deprecated CSS variable names..." -ForegroundColor Cyan

$s25StartErrors = $E.Errors
$s25StartWarnings = $E.Warnings

$deprecatedVars = @{
  '--bg-modal'        = 'var(--color-bg)'
  '--bg-card'         = 'var(--color-bg-card) or var(--color-bg-secondary)'
  '--bg-input'        = 'var(--color-bg-tertiary)'
  '--border-color'    = 'var(--color-border)'
  '--text-primary'    = 'var(--color-text-primary)'
  '--text-secondary'  = 'var(--color-text-secondary)'
  '--text-muted'      = 'var(--color-text-tertiary)'
  '--accent-primary'  = 'var(--color-primary)'
  '--danger'          = 'var(--color-error)'
  '--bg-secondary'    = 'var(--color-bg-secondary)'
  '--accent-glow'     = 'var(--color-primary-light)'
  '--bg'             = 'var(--color-bg)'
  '--warning'        = 'var(--color-warning)'
}

# Scan CSS files for deprecated var() usages (including fallback patterns like var(--xxx, ...))
$cssFilesS25 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.css" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })
foreach ($cf in $cssFilesS25) {
  $cc = Get-FileContent $cf.FullName
  if (-not $cc) { continue }
  $relFP = $cf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  $cLines = $cc -split "`n"
  for ($li = 0; $li -lt $cLines.Count; $li++) {
    foreach ($dv in $deprecatedVars.Keys) {
      if ($cLines[$li] -match [regex]::Escape("var(${dv}") + '[\),\s]') {
        Fail "S25-DEPRECATED-CSS-VAR" $relFP "L$($li + 1)" "Deprecated CSS variable 'var($dv)' found. Replace with: $($deprecatedVars[$dv])"
      }
    }
  }
}

# Scan TS/TSX files for deprecated CSS variables in inline styles and template literals
$allSrcFilesS25 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })
foreach ($f in $allSrcFilesS25) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  $fLines = $fc -split "`n"
  for ($li = 0; $li -lt $fLines.Count; $li++) {
    $line = $fLines[$li]
    if ($line.Trim() -match '^\s*(//|\*|/\*\*)') { continue }
    if ($line -match 'deprecated|legacy|\u65e7\u53d8\u91cf|\u5e9f\u5f03') { continue }

    foreach ($dv in $deprecatedVars.Keys) {
      $found = $false
      if ($line -match [regex]::Escape("var(${dv})")) {
        $found = $true
      }
      elseif ($line -match "['`"]${dv}['`"]\s*[\s:]") {
        $found = $true
      }

      if ($found) {
        Fail "S25-DEPRECATED-CSS-VAR" $relFP "L$($li + 1)" "Deprecated CSS variable name '${dv}' found in code. Replace with: $($deprecatedVars[$dv])"
      }
    }
  }
}

$s25Errors = $E.Errors - $s25StartErrors
$s25Warnings = $E.Warnings - $s25StartWarnings
Write-Host "  S25-DEPRECATED-CSS-VAR: $s25Errors errors, $s25Warnings warnings" -ForegroundColor $(if ($s25Errors -gt 0) { "Red" } elseif ($s25Warnings -gt 0) { "Yellow" } else { "Green" })

# S26 owns its own whitelist construction and reporting while sharing this scan's caches.
. (Join-Path $PSScriptRoot 'css-scanner/unknown-variable-rule.ps1')
