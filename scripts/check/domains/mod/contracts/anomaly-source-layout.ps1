# Purpose: Detect misplaced internal files and unmatched CSS modules.
# Owner: quality:mod
# Responsibility: A3 internal file, orphan CSS, and missing CSS import assertions only.

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
