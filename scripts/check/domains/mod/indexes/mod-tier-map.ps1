# Purpose: Resolve the legacy diagnostic tier of a known MOD.
# Owner: quality:mod
# Responsibility: Static MOD-to-tier lookup only.

function Get-ModTier($modName) {
  $tierMap = @{
    'mod-engine' = 'Engine'; 'mod-character' = 'Data'; 'mod-difficulty' = 'Data'
    'mod-world' = 'World'; 'mod-power-system' = 'World'; 'mod-tech-level' = 'World'
    'mod-history-dynamics' = 'World'; 'mod-progression' = 'Data'
    'mod-ui' = 'UI'; 'mod-settings' = 'UI'
    'mod-world-map' = 'UI'; 'mod-pages' = 'Page'
  }
  if ($tierMap.ContainsKey($modName)) { return $tierMap[$modName] }
  return $null
}
