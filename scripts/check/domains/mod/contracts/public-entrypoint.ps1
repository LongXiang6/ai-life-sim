# Purpose: Validate one MOD public index projection.
# Owner: quality:mod
# Responsibility: P1 named public re-export assertions only.

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName
  #           P1: index.ts
  $indexPath = Join-Path $modPath "index.ts"
  if (Test-Path $indexPath) {
    $indexContent = Get-FileContent $indexPath

    #        types.ts                    index.ts     re-export
    $typesPath = Join-Path $modPath "types.ts"
    if (Test-Path $typesPath) {
      $typesContent = Get-FileContent $typesPath
      $typeExports = [regex]::Matches($typesContent, 'export (?:interface|type|enum) (\w+)')
      foreach ($te in $typeExports) {
        $tn = $te.Groups[1].Value
        if ($tn -match '(Props|Config|State|Internal)$') { continue }
        if ($indexContent -notmatch [regex]::Escape($tn)) {
          Warn "P1-INDEX-EXPORT" $modName "" "types.ts        '$tn'        index.ts     re-export"
        }
      }
    }

    #        hooks.ts
    $hooksPath = Join-Path $modPath "hooks.ts"
    if (Test-Path $hooksPath) {
      $hooksContent = Get-FileContent $hooksPath
      $hookExports = [regex]::Matches($hooksContent, 'export (?:function|const) (use\w+)')
      foreach ($he in $hookExports) {
        $hn = $he.Groups[1].Value
        if ($indexContent -notmatch [regex]::Escape($hn)) {
          Warn "P1-INDEX-EXPORT" $modName "" "hooks.ts        '$hn'        index.ts          "
        }
      }
    }

    #        store.ts
    $storeP1Path = Join-Path $modPath "store.ts"
    if (Test-Path $storeP1Path) {
      $storeP1Content = Get-FileContent $storeP1Path
      $storeP1Exports = [regex]::Matches($storeP1Content, 'export const (use\w+Store)')
      foreach ($se in $storeP1Exports) {
        $sn = $se.Groups[1].Value
        if ($indexContent -notmatch [regex]::Escape($sn)) {
          Warn "P1-INDEX-EXPORT" $modName "" "store.ts        '$sn'        index.ts          "
        }
      }
    }

    #        constants.ts
    $constantsP1Path = Join-Path $modPath "constants.ts"
    if (Test-Path $constantsP1Path) {
      $constContent = Get-FileContent $constantsP1Path
      $constExports = [regex]::Matches($constContent, 'export const ([A-Z][A-Z0-9_]+)')
      foreach ($ce in $constExports) {
        $cn = $ce.Groups[1].Value
        if ($indexContent -notmatch [regex]::Escape($cn)) {
          Warn "P1-INDEX-EXPORT" $modName "" "constants.ts              '$cn'        index.ts          "
        }
      }
    }
  }
}
