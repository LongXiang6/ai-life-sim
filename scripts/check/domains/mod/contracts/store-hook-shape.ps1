# Purpose: Validate one MOD store and hook declaration shape.
# Owner: quality:mod
# Responsibility: C10 and C13 Store naming, Manifest registration, middleware, summary, and Hook assertions only.

foreach ($modDir in $modDirs) {
  $modName = $modDir.Name
  $modPath = $modDir.FullName
  $manifestPath = Join-Path $modPath 'manifest.ts'
  if (-not (Test-Path $manifestPath)) { continue }
  $manifestRaw = Get-FileContent $manifestPath
  $storePath = Join-Path $modPath "store.ts"
  if (Test-Path $storePath) {
    $storeContent = Get-FileContent $storePath

    #           C10: Store
    $storeNameMatch = [regex]::Match($storeContent, 'export const (use\w+Store)')
    if ($storeNameMatch.Success) {
      $storeName = $storeNameMatch.Groups[1].Value
      if ($storeName -match '^use[A-Z]\w+Store$') {
        Pass "C10-STORE-NAME" $modName "Store              use{PascalCase}Store   $storeName"
      } else {
        Fail "C10-STORE-NAME" $modName "" "Store                 use{PascalCase}Store   $storeName"
      }
      #     manifest
      $manifestStores = @(Get-DeclaredStringArray $manifestRaw 'stores')
      if ($storeName -notin $manifestStores) {
        Fail "C10-STORE-MANIFEST" $modName "" "Store '$storeName'        manifest.ts stores          "
      }
    }

    #           C13: Zustand getSummary
    if ($storeContent -match 'getSummary') {
      if ($storeContent -match 'const\s+\w+\s*=\s*get\(\)') {
        Pass "C13-GETSUMMARY" $modName "getSummary()        get()        selector                "
      } else {
        Warn "C13-GETSUMMARY" $modName "" "getSummary()                          get()       "
      }
    }
    #           C10-STORE-MIDDLEWARE:        Zustand
    if ($storeContent -notmatch '\bdevtools\s*\(') {
      Warn "C10-STORE-MIDDLEWARE" $modName "" "Store        devtools()          "
    }
    if ($storeContent -notmatch "\bpersist\s*\(") {
      Warn "C10-STORE-MIDDLEWARE" $modName "" "Store        persist()          "
    }
  }

  #           hooks.ts
  $hooksPath = Join-Path $modPath "hooks.ts"
  if (Test-Path $hooksPath) {
    $hooksContent = Get-FileContent $hooksPath
    $hookExports = [regex]::Matches($hooksContent, 'export function (use\w+)')
    foreach ($h in $hookExports) {
      $hn = $h.Groups[1].Value
      if ($hn -match '^use[A-Z]') {
        Pass "C10-HOOK-NAME" $modName "Hook              use{PascalCase}   $hn"
      } else {
        Fail "C10-HOOK-NAME" $modName "" "Hook                 use{PascalCase}   $hn"
      }
    }
    #           C10-HOOK-FORMAT:        const
    $constHookMatches = [regex]::Matches($hooksContent, 'export const (use\w+)\s*=')
    foreach ($ch in $constHookMatches) {
      Warn "C10-HOOK-FORMAT" $modName "" "Hook '$($ch.Groups[1].Value)'        'export const ='                    'export function'"
    }
  }
}
