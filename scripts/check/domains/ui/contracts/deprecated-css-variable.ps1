# Purpose: Detect deprecated CSS custom-property names in CSS and TypeScript source.
# Owner: quality:ui
# Responsibility: S25 deprecated CSS variable assertions and replacement map only.

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
$cssFilesS25 = $cssFiles
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
$allSrcFilesS25 = $styleSourceFiles
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
