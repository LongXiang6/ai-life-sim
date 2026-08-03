# Purpose: Diagnose imported MOD symbols that are not used by the importing file.
# Owner: quality:mod
# Responsibility: D16 unused constant and callable import assertions only.

# === D16: Function call chain     imported functions actually called ===
Write-Host "  [D16] Checking function call chains..." -ForegroundColor DarkGray

$modExportFuncs = @{}
foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  $ip = Join-Path $info.Path "index.ts"
  if (-not (Test-Path $ip)) { continue }
  $ic = Get-FileContent $ip
  if (-not $ic) { continue }

  # Extract all exported function/class/hook/store names
  $funcNames = @()
  $funcMatches = [regex]::Matches($ic, 'export\s+(?:function|const)\s+(\w+)')
  foreach ($fm in $funcMatches) { $funcNames += $fm.Groups[1].Value }
  $namedExportMatches = [regex]::Matches($ic, 'export\s+\{\s*([^}]+)\s*\}')
  foreach ($nem in $namedExportMatches) {
    $rawNames = ($nem.Groups[1].Value -replace '\s+as\s+\w+', '') -split ','
    foreach ($n in $rawNames) {
      $clean = $n.Trim()
      if ($clean) { $funcNames += $clean }
    }
  }
  $modExportFuncs[$mn] = $funcNames
}

# Check if imported functions are actually used (called) in the target file
foreach ($f in $allTsFiles2) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  $namedImports = [regex]::Matches($fc, "import\s+\{([^}]+)\}\s+from\s+'@/mods/(mod-[a-z0-9-]+)'")
  foreach ($ni in $namedImports) {
    $importedNames = $ni.Groups[1].Value -split ","
    $targetMod = $ni.Groups[2].Value
    if (-not $modExportFuncs.ContainsKey($targetMod)) { continue }

    foreach ($iname in $importedNames) {
      $cleanName = ($iname.Trim() -replace '\s+as\s+\w+', "" -replace '\s+type\s+', "").Trim()
      if (-not $cleanName -or $cleanName -eq "type") { continue }

      # Skip UPPER_SNAKE_CASE constants - they are values, not callables
      if ($cleanName -cmatch '^[A-Z][A-Z0-9_]+$') {
        # Check if constant is used anywhere in the file (not just as function call)
        $importLine = $ni.Groups[0].Value
        $restOfFileC = $fc -replace [regex]::Escape($importLine), ''
        $restOfFileC = $restOfFileC -replace "import\s+\{[^}]*\}\s+from\s+'[^']+'", ''
        $restOfFileC = $restOfFileC -replace "import\s+type\s+\{[^}]*\}\s+from\s+'[^']+'", ''
        if ($restOfFileC -notmatch [regex]::Escape($cleanName)) {
          Warn "D16-CONST-UNUSED" $relFP "" "constant '$cleanName' imported from '$targetMod' but never referenced"
        }
        continue
      }

      # Check if the imported name appears as a function call in the file body (after the import section)
      $usagePattern = [regex]::Escape($cleanName) + '\s*[\(<:]'
      # Remove only the specific import line and check remaining content
      $importLine = $ni.Groups[0].Value
      $restOfFile = $fc -replace [regex]::Escape($importLine), ''
      # Also strip all import lines to avoid matching type-only imports
      $restOfFile = $restOfFile -replace "import\s+\{[^}]*\}\s+from\s+'[^']+'", ''
      $restOfFile = $restOfFile -replace "import\s+type\s+\{[^}]*\}\s+from\s+'[^']+'", ''
      if ($restOfFile -match $usagePattern) {
        # Function is used - good
      } else {
        Warn "D16-FUNCTION-UNUSED" $relFP "" "'$cleanName' imported from '$targetMod' but may not be used in file"
      }
    }
  }
}
