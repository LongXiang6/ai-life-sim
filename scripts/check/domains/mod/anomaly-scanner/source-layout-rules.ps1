# Purpose: Detect unresolved imports, React anti-patterns, and misplaced source files.
# Owner: quality:mod
# Responsibility: A1-A4 anomaly rules only.

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

# ============================================================
# A2: React anti-patterns (regex-based, no AST)
# ============================================================
Write-Host "  [A2] Checking React anti-patterns..." -ForegroundColor DarkGray

$allTsxFiles = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })

foreach ($f in $allTsxFiles) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # A2a: useEffect with async callback (missing cleanup)
  $asyncEffects = [regex]::Matches($fc, 'useEffect\s*\(\s*async\s*\(')
  foreach ($m in $asyncEffects) {
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
      Warn "A2-ASYNC-EFFECT" $relFP "L$lineNum" "useEffect with async callback without cleanup - may cause memory leaks or stale state"
  }

  # A2b: useState initialized with async value
  $asyncState = [regex]::Matches($fc, 'useState\s*\(\s*await\s')
  foreach ($m in $asyncState) {
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
      Fail "A2-ASYNC-STATE" $relFP "L$lineNum" "useState initialized with await - will never resolve. Use useEffect instead."
  }

  # A2c: useEffect without dependency array (only flag single dependency, ignore empty array or explicit deps)
  $looseEffects = [regex]::Matches($fc, 'useEffect\s*\(\s*\(\s*\)\s*=>\s*\{')
  foreach ($m in $looseEffects) {
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
    # Check if there's a dep array after the callback body
    $afterCallback = $fc.Substring($m.Index)
    if ($afterCallback -match '^\s*useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*\}[^,)]*\s*\)\s*$') {
      Warn "A2-MISSING-DEPS" $relFP "L$lineNum" "useEffect has no dependency array - verify it's intentional (add [] or variable deps)"
    }
  }

  # A2d: Mutation of props
  $propMutations = [regex]::Matches($fc, '\b(prop|props|args)\s*\.\s*\w+\s*=')
  foreach ($m in $propMutations) {
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
      Warn "A2-PROP-MUTATION" $relFP "L$lineNum" "Direct mutation of props/props/args detected - React props should be immutable"
  }
}

# ============================================================
# A3: File location validator
# ============================================================
Write-Host "  [A3] Checking file location conventions..." -ForegroundColor DarkGray

# A3a: _internal files outside _internal directories
Get-ChildItem -Path $SrcDir -Recurse -Include "*_internal*" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' } | ForEach-Object {
  $relFP = $_.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")
  $dirPath = (Split-Path $_.FullName -Parent).Replace("\", "/")
  if ($dirPath -notmatch '/_internal(/|$)' -and $dirPath -notmatch '/scripts/') {
    Warn "A3-INTERNAL-FILE" $relFP "" "File contains '_internal' in name but is not in _internal directory"
  }
}

# A3b: CSS module files without matching component (orphan CSS)
$allCssFilesA3 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.module.css" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })
foreach ($cssf in $allCssFilesA3) {
  $relFP = $cssf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")
  $baseName = $cssf.Name -replace '\.module\.css$', ''
  $cssDir = Split-Path $cssf.FullName -Parent
  $cssDirRel = $cssDir.Replace("\", "/")

  # Skip CSS in desktop/mobile subdirectories (architectural convention: HelpModal pattern)
  if ($cssDirRel -match '/(desktop|mobile)$') { continue }

  # Check if CSS is imported by a co-located page.tsx (Next.js App Router convention)
  $pageFile = Join-Path $cssDir "page.tsx"
  if (Test-Path $pageFile) {
    $pfc = Get-FileContent $pageFile
    if ($pfc -and $pfc -match [regex]::Escape($cssf.Name)) { continue }
  }

  # Check if a matching .tsx file exists in same directory
  $matchFound = $false
  foreach ($ext in @('.tsx', '.ts')) {
    $candidate = Join-Path $cssDir "${baseName}${ext}"
    if (Test-Path $candidate) { $matchFound = $true; break }
  }

  if (-not $matchFound) {
    Warn "A3-ORPHAN-CSS" $relFP "" "CSS module has no matching component file (${baseName}.tsx) in same directory. Consider renaming CSS or component to match."
  }
}

# A3c: .ts/.tsx files with CSS import but no matching .module.css
Get-ChildItem -Path $SrcDir -Recurse -Include "*.tsx", "*.ts" -File -ErrorAction SilentlyContinue | Where-Object {
  $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' -and
  $_.Name -notin @('manifest.ts', 'index.ts', 'store.ts', 'hooks.ts', 'constants.ts', 'utils.ts', 'types.ts', 'layout.tsx', 'page.tsx', 'route.ts')
} | ForEach-Object {
  $fc = Get-FileContent $_.FullName
  if (-not $fc) { return }
  $relFP = $_.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  $cssImport = [regex]::Match($fc, "import\s+\w+\s+from\s+['`"](\./[^'`"]+\.module\.css)['`"]")
  if ($cssImport.Success) {
    $cssRelative = $cssImport.Groups[1].Value
    $fileDir = Split-Path $_.FullName -Parent
    try {
      $cssFullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fileDir, $cssRelative))
    } catch { return }
    if (-not (Test-Path $cssFullPath)) {
      Warn "A3-MISSING-CSS" $relFP "" "Imports '$cssRelative' but CSS module file not found"
    }
  }
}

# A4 (deep relative imports) merged into A1 file scan above — single pass over $allSrcFilesA1

$anomErrors = $E.Errors - $anomStartErrors
$anomWarnings = $E.Warnings - $anomStartWarnings

# ============================================================
