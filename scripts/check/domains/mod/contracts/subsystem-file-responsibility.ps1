# Purpose: Validate that subsystem source remains focused on subsystem behavior.
# Owner: quality:mod
# Responsibility: G4 type, constant, and hardcoded-pattern assertions only.

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName
  # G4: subsystems/ purity check
  $subDir = Join-Path $modPath "subsystems"
  if (Test-Path $subDir) {
    $subFiles = @(Get-ChildItem -Path $subDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
    foreach ($sf in $subFiles) {
      $sc = Get-FileContent $sf.FullName
      $relPath = "src/mods/${modName}/subsystems/$($sf.Name)"
      if ($sc -match 'export (?:interface|type|enum)\s') {
        Warn "G4-SUB-TYPE" $relPath "" "subsystem contains type definitions, recommend extracting to types.ts"
      }
      if ($sc -match 'export const [A-Z_]+\s*=') {
        Warn "G4-SUB-CONST" $relPath "" "subsystem contains constant definitions, recommend extracting to constants.ts"
      }
      if ($sc -match '(?:const|let|var)\s+\w+\s*=\s*/.+/' -and $modName -eq 'mod-engine') {
        Warn "G4-SUB-REGEX" $relPath "" "subsystem contains hardcoded regex, recommend extracting to patterns/ directory"
      }
    }
  }
}
