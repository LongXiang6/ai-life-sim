# Purpose: Diagnose helper functions exported directly from subsystem files.
# Owner: quality:mod
# Responsibility: H4 subsystem helper export assertions only.

foreach ($md in $modDirs) {
  $mn = $md.Name
  $subDir = Join-Path $md.FullName "subsystems"
  if (-not (Test-Path $subDir)) { continue }
  $subFiles = @(Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
  foreach ($sf in $subFiles) {
    $sc = Get-FileContent $sf.FullName
    $helperExports = [regex]::Matches($sc, 'export (?:function|const)\s+(\w+)')
    foreach ($he in $helperExports) {
      $helperName = $he.Groups[1].Value
      # Skip subsystem class definitions.
      if ($sc -match "class\s+$helperName\s+(?:implements\s+ISubSystem\b|extends\s+BaseSubsystem\b)") { continue }
      # Skip known exception patterns
      if ($helperName -match 'System$') { continue }
      Warn "H4-HELPER-EXPORT" "src/mods/${mn}/subsystems/$($sf.Name)" "" "subsystem exports helper '$helperName', consider removing export or moving to utils.ts"
    }
  }
}
