# Purpose: Compare TypeScript-set and CSS-defined custom properties for missing or suspicious pairs.
# Owner: quality:ui
# Responsibility: S24 orphan, undefined, and similar CSS variable assertions only.

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
