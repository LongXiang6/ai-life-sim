# Purpose: Validate Atom and Molecule component state ownership boundaries.
# Owner: quality:ui
# Responsibility: U3 Atom Hook and lower-layer Store access assertions only.

#
# U3: Component layering rules (Atom/Molecule/Organism)
#
Write-Host "  [U3] Checking component layering..." -ForegroundColor DarkGray
$compDirs = @()
$modCompDirs = Get-ChildItem -Path (Join-Path $SrcDir "mods") -Directory | Where-Object { $_.Name -match '^mod-' }
foreach ($mcd in $modCompDirs) {
  $cd = Join-Path $mcd.FullName "components"
  if (Test-Path $cd) { $compDirs += $cd }
}
foreach ($cd in $compDirs) {
  $atomsDir = Join-Path $cd "atoms"
  $moleculesDir = Join-Path $cd "molecules"
  $organismsDir = Join-Path $cd "organisms"
  foreach ($dirInfo in @(@{Path=$atomsDir;Level="Atom"}, @{Path=$moleculesDir;Level="Molecule"}, @{Path=$organismsDir;Level="Organism"})) {
    if (-not (Test-Path $dirInfo.Path)) { continue }
    $compTsxFiles = @(Get-ChildItem -Path $dirInfo.Path -Filter "*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch "\.types\.|^index\." })
    foreach ($cf in $compTsxFiles) {
      $cc = Get-FileContent $cf.FullName
      if (-not $cc) { continue }
      $cfRel = $cf.Name
      if ($dirInfo.Level -eq "Atom") {
        if ($cc -match '\buseState\b|\buseCallback\b|\buseEffect\b|\buseRef\b|\buseMemo\b') {
          Warn "U3-ATOM-HOOK" $cfRel "" "Atom component should not use React Hooks"
        }
      }
      if ($dirInfo.Level -in @("Atom","Molecule")) {
        if ($cc -match '\buse\w+Store\b') {
          Warn "U3-LAYER-STORE" $cfRel "" "$($dirInfo.Level) component should not access Store directly"
        }
      }
    }
  }
}
