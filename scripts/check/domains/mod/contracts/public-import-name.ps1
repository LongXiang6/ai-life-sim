# Purpose: Compare named public MOD imports with target index exports.
# Owner: quality:mod
# Responsibility: D15 imported-name mismatch assertions only.

# === D15: Import name vs export name matching ===
Write-Host "  [D15] Checking import/export match..." -ForegroundColor DarkGray

$modExportsCache = @{}
foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  $ip = Join-Path $info.Path "index.ts"
  if (-not (Test-Path $ip)) { continue }
  $ic = Get-FileContent $ip
  $exportNames = @{}
  # Match: export const/function/class/type/interface/enum Name
  $declExports = [regex]::Matches($ic, 'export\s+(?:const|function|class|type|interface|enum)\s+(\w+)')
  foreach ($de in $declExports) {
    $exportNames[$de.Groups[1].Value] = $true
  }
  # Match: export { a, b, c } or export { a as b }
  $namedExportMatches = [regex]::Matches($ic, 'export\s+\{\s*([^}]+)\s*\}')
  foreach ($nem in $namedExportMatches) {
    $rawNames = ($nem.Groups[1].Value -replace '\s+as\s+\w+', '') -split ','
     foreach ($n in $rawNames) {
       $clean = $n.Trim()
      if ($clean) { $exportNames[$clean] = $true }
    }
  }
  $modExportsCache[$mn] = $exportNames
}

$allTsFiles2 = $AllSrcFiles  # reuse from orchestrator
foreach ($f in $allTsFiles2) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")
  $namedImports = [regex]::Matches($fc, "import\s+\{([^}]+)\}\s+from\s+'@/mods/(mod-[a-z0-9-]+)'")
  foreach ($ni in $namedImports) {
    $importedNames = $ni.Groups[1].Value -split ","
    $targetMod = $ni.Groups[2].Value
    if (-not $modExportsCache.ContainsKey($targetMod)) { continue }
    foreach ($iname in $importedNames) {
      $cleanName = ($iname.Trim() -replace '\s+as\s+\w+', "" -replace '\s+type\s+', "").Trim()
      if (-not $cleanName -or $cleanName -eq "type") { continue }
      if (-not $modExportsCache[$targetMod].ContainsKey($cleanName)) {
        Warn "D15-IMPORT-MISMATCH" $relFP "" "'$cleanName' imported from '$targetMod' but not found in its index.ts exports"
      }
    }
  }
}
