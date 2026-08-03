# Purpose: Validate desktop and mobile variants for organism selectors.
# Owner: quality:ui
# Responsibility: U5 responsive organism variant assertions only.

foreach ($md in $modDirs) {
  $mn = $md.Name
  $componentsDir = Join-Path $md.FullName "components"
  if (-not (Test-Path $componentsDir)) { continue }
  $organismsDir = Join-Path $componentsDir "organisms"
  if (-not (Test-Path $organismsDir)) { continue }

  $orgFiles = @(Get-ChildItem -Path $organismsDir -Filter "*.tsx" -File | Where-Object { $_.Name -notmatch "\.types\.|^index\.|\.desktop\.|\.mobile\." })
  foreach ($of in $orgFiles) {
    $baseName = $of.Name -replace '\.tsx$', ''
    $desktopFile = Join-Path $organismsDir "${baseName}.desktop.tsx"
    $mobileFile = Join-Path $organismsDir "${baseName}.mobile.tsx"
    $selectorFile = Join-Path $organismsDir "${baseName}.tsx"
    if (-not (Test-Path $desktopFile)) {
      Warn "U5-PC-SPLIT" $mn "" "Organism '$baseName' missing ${baseName}.desktop.tsx"
    }
    if (-not (Test-Path $mobileFile)) {
      Warn "U5-PC-SPLIT" $mn "" "Organism '$baseName' missing ${baseName}.mobile.tsx"
    }
  }
}
