# Purpose: Validate that cross-MOD imports use declared public entrypoints.
# Owner: quality:mod
# Responsibility: C9 public path and private _internal import assertions only.

foreach ($modName in $ModSourceIndex.Keys) {
  foreach ($record in $ModSourceIndex[$modName].Files) {
    foreach ($crossImport in $record.CrossImports) {
      $subPath = $crossImport.SubPath
      if (-not $subPath -or $subPath -eq '/index') { continue }

      $allowedSecondary = $false
      $entryName = $subPath.TrimStart('/')
      if ($Script:AllowedSecondaryPublicImports.ContainsKey($crossImport.Mod)) {
        foreach ($allowed in $Script:AllowedSecondaryPublicImports[$crossImport.Mod]) {
          $baseName = [System.IO.Path]::GetFileNameWithoutExtension($allowed)
          if ($entryName -eq $baseName -or $entryName -eq $allowed) {
            $allowedSecondary = $true
            break
          }
        }
      }
      if ($allowedSecondary) { continue }

      if ($subPath -match '/_internal/') {
        Fail 'C9-CROSS-INTERNAL' $record.RelativePath '' "          @/mods/$($crossImport.Mod)        _internal/"
      } else {
        Fail 'C9-CROSS-PATH' $record.RelativePath '' "          @/mods/$($crossImport.Mod)       index.ts                                  '$subPath'"
      }
    }
  }
}
