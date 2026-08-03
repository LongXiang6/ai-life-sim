# Purpose: Build one cached CSS custom-property definition and usage index.
# Owner: quality:ui
# Responsibility: Project TypeScript setters and CSS definitions/usages into read-only maps only.

$tsCssVars = @{}
$cssVarDefs = @{}
$cssVarUsages = @{}
$cssFiles = @($AllSrcFiles | Where-Object { $_.Extension -eq '.css' })
$styleSourceFiles = @($AllSrcFiles | Where-Object { $_.Extension -in @('.ts', '.tsx') })

foreach ($sourceFile in $styleSourceFiles) {
  $content = Get-FileContent $sourceFile.FullName
  if (-not $content) { continue }
  $relativePath = $sourceFile.FullName.Substring($SrcDir.Length + 1).Replace('\', '/')
  foreach ($match in [regex]::Matches($content, 'setProperty\s*\(\s*[''"](--[\w-]+)[''"]')) {
    $name = $match.Groups[1].Value
    if (-not $tsCssVars.ContainsKey($name)) { $tsCssVars[$name] = @() }
    $tsCssVars[$name] += $relativePath
  }
  foreach ($match in [regex]::Matches($content, 'style=\{\{[^}]*?[''"](--[\w-]+)[''"]\s*:')) {
    $name = $match.Groups[1].Value
    if (-not $tsCssVars.ContainsKey($name)) { $tsCssVars[$name] = @() }
    $tsCssVars[$name] += $relativePath
  }
}

foreach ($cssFile in $cssFiles) {
  $content = Get-FileContent $cssFile.FullName
  if (-not $content) { continue }
  $relativePath = $cssFile.FullName.Substring($SrcDir.Length + 1).Replace('\', '/')
  foreach ($match in [regex]::Matches($content, 'var\(\s*(--[\w-]+)')) {
    $name = $match.Groups[1].Value
    if (-not $cssVarUsages.ContainsKey($name)) { $cssVarUsages[$name] = @() }
    $cssVarUsages[$name] += $relativePath
  }
  $lines = $content -split "`n"
  for ($lineIndex = 0; $lineIndex -lt $lines.Count; $lineIndex++) {
    if ($lines[$lineIndex] -match '^\s*(--[\w-]+)\s*:') {
      $name = $Matches[1]
      if (-not $cssVarDefs.ContainsKey($name)) { $cssVarDefs[$name] = @() }
      $cssVarDefs[$name] += "${relativePath}:L$($lineIndex + 1)"
    }
  }
}
