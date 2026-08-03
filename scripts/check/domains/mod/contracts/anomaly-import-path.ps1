# Purpose: Detect unresolved and overly deep TypeScript import paths.
# Owner: quality:mod
# Responsibility: A1 missing target/MOD and A4 deep relative import assertions only.

# A1: Suspicious import paths — imports that don't resolve to real files
# ============================================================
Write-Host "  [A1] Checking import path file existence..." -ForegroundColor DarkGray

$allModDirs = @(Get-ChildItem -Path $modsDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^mod-' })
$modDirMap = @{}
foreach ($md in $allModDirs) { $modDirMap[$md.Name] = $md.FullName }

$allSrcFilesA1 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })
$importCache = @{}

foreach ($f in $allSrcFilesA1) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Find all relative imports: from './xxx' or from '../xxx'
  $relImports = [regex]::Matches($fc, "from\s+['`"](\.\.?/[^'`"]+)['`"]")
  foreach ($m in $relImports) {
    $importPath = $m.Groups[1].Value
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count

    # Resolve relative path
    $fileDir = Split-Path $f.FullName -Parent
    try {
      $resolvedBase = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fileDir, $importPath))
    } catch { continue }

    # First check: does the exact path exist as a file? (handles explicit extensions like .module.css, .json)
    if (Test-Path -Path $resolvedBase -PathType Leaf) { continue }

    # Second check: try adding common extensions (for extensionless imports)
    $found = $false
    foreach ($ext in @('.ts', '.tsx', '.js', '.jsx', '.css', '/index.ts', '/index.tsx')) {
      if (Test-Path -Path "${resolvedBase}${ext}" -PathType Leaf) { $found = $true; break }
    }

    if (-not $found) {
      Fail "A1-IMPORT-MISSING" $relFP "L$lineNum" "Import '$importPath' resolves to a file that does not exist"
    }
  }

  # Find @/mods/... imports and verify MOD exists
  $modImports = [regex]::Matches($fc, "from\s+['`"]@/mods/(mod-[^/']+)(?:/[^'`"]*)?['`"]")
  foreach ($m in $modImports) {
    $modName = $m.Groups[1].Value
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count

    if (-not $modDirMap.ContainsKey($modName) -and $modName -ne 'mod-test') {
      Fail "A1-IMPORT-MOD" $relFP "L$lineNum" "Import from '$modName' but no MOD directory found at '$modsDir\$modName'"
    }
  }

  # === A4: Deep relative imports (merged into A1 pass) ===
  $deepImports = [regex]::Matches($fc, "from\s+['`"](\.\./(\.\./){2,}[^'`"]+)['`"]")
  foreach ($m in $deepImports) {
    $importPath = $m.Groups[1].Value
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
      Warn "A4-DEEP-IMPORT" $relFP "L$lineNum" "Deep relative import '$importPath' - consider using @/mods/ alias or restructuring"
  }
}
