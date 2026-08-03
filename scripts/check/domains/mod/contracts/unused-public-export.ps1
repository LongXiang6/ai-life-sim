# Purpose: Diagnose public MOD exports with no external named import.
# Owner: quality:mod
# Responsibility: D22 verbose-only unused public export assertions only.

# === D22: Unused public export hints ===
Write-Host "  [D22] Checking unused exports..." -ForegroundColor DarkGray

# D22 is intentionally verbose-only because it is advisory. Full gates keep the
# separate D23 runtime-cycle scanner and D24 check without paying for low-confidence hints.
if ($VerboseOutput) {
  $modExports = @{}
  foreach ($modName in @($AllModInfo.Keys | Sort-Object)) {
    $indexPath = Join-Path $AllModInfo[$modName].Path 'index.ts'
    if (-not (Test-Path $indexPath)) { continue }
    $indexContent = Get-FileContent $indexPath
    if (-not $indexContent) { continue }
    $exports = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($match in [regex]::Matches($indexContent, 'export\s+\{\s*([^}]+)\s*\}')) {
      foreach ($entry in ($match.Groups[1].Value -split ',')) {
        $clean = ($entry -replace '//.*$', '').Trim()
        $clean = ($clean -replace '^type\s+', '' -split '\s+as\s+')[0].Trim()
        if ($clean -match '^[A-Za-z_]\w*$') { [void]$exports.Add($clean) }
      }
    }
    foreach ($match in [regex]::Matches($indexContent, 'export\s+(?:function|const|class|type|interface|enum)\s+([A-Za-z_]\w*)')) {
      [void]$exports.Add($match.Groups[1].Value)
    }
    $modExports[$modName] = $exports
  }

  $referencedExports = @{}
  foreach ($sourceContent in $sourceContentByPath.Values) {
    $bindingMatches = [regex]::Matches(
      $sourceContent,
      "(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['`"]@/mods/(mod-[a-z0-9-]+)(?:/index)?['`"]"
    )
    foreach ($bindingMatch in $bindingMatches) {
      $targetMod = $bindingMatch.Groups[2].Value
      if (-not $referencedExports.ContainsKey($targetMod)) {
        $referencedExports[$targetMod] = [System.Collections.Generic.HashSet[string]]::new(
          [System.StringComparer]::Ordinal
        )
      }
      foreach ($entry in ($bindingMatch.Groups[1].Value -split ',')) {
        $clean = ($entry -replace '//.*$', '').Trim()
        $clean = ($clean -replace '^type\s+', '' -split '\s+as\s+')[0].Trim()
        if ($clean -match '^[A-Za-z_]\w*$') {
          [void]$referencedExports[$targetMod].Add($clean)
        }
      }
    }
  }

  foreach ($modName in @($modExports.Keys | Sort-Object)) {
    foreach ($exportName in @($modExports[$modName] | Sort-Object)) {
      if ($exportName -match '^(type|interface|loadOrder|name|version|description)$') { continue }
      if (-not $referencedExports.ContainsKey($modName) -or
          -not $referencedExports[$modName].Contains($exportName)) {
        Warn 'D22-UNUSED-EXPORT' "src/mods/${modName}/index.ts" '' "Export '$exportName' from '$modName' may be unused (no external public import found)"
      }
    }
  }
}
