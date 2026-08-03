# Purpose: Coordinate UI source rules that operate on shared TypeScript and TSX caches.
# Owner: UI static analysis
# Responsibility: UI rule ordering and directory/layer checks; the unified TSX pass lives below ui-scanner/.

Write-Host ""
Write-Host "          UI                          " -ForegroundColor Cyan

$startErrors = $E.Errors
$startWarnings = $E.Warnings

#                                                                                                                                                                      
# Scan-UiForDirectory:                          .tsx       
#                                                                                                                                                                      
function Scan-UiForDirectory($DirPath, $DirLabel) {
  if (-not (Test-Path $DirPath)) { return }
  #                                                              I/O
  if ($AllTsxFiles) {
    $tsxFiles = @($AllTsxFiles | Where-Object { $_.FullName.StartsWith($DirPath, [StringComparison]::OrdinalIgnoreCase) })
  } else {
    $tsxFiles = @(Get-ChildItem -Path $DirPath -Recurse -Filter *.tsx -File -ErrorAction SilentlyContinue)
  }
  foreach ($file in $tsxFiles) {
    $content = Get-FileContent $file.FullName
    if (-not $content) { continue }
    $fname = $file.Name
    $relFP = "src/${DirLabel}/" + $file.FullName.Substring($DirPath.Length + 1).Replace('\', '/')
    $fname = $relFP  # Override with full path for accurate reporting
    $lines = $content -split "`n"

    #           U1: alert/prompt/confirm                 
    for ($ui = 0; $ui -lt $lines.Count; $ui++) {
      $uline = $lines[$ui].Trim()
      if ($uline -match '^\s*(//|\*|/\*\*)') { continue }
      if ($uline -match '\b(alert|confirm|prompt)\s*\(') {
        Warn "U1-ALERT" $fname "L$($ui+1)" "             alert/confirm/prompt                      Modal/Toast"
      }
    }

    #           U2:        style                             
    for ($ui = 0; $ui -lt $lines.Count; $ui++) {
      $uline = $lines[$ui].Trim()
      if ($uline -match '^\s*(//|\*|/\*\*)') { continue }
      if ($uline -match 'style=\{\{') {
        if ($uline -match '\d+px') {
          Warn "U2-INLINE-STYLE" $fname "L$($ui+1)" "       style                                   TailwindCSS        Design Token"
        } else {
          Warn "U2-INLINE-STYLE" $fname "L$($ui+1)" "             style                      TailwindCSS    "
        }
      }
    }

    #           C15:                                
    for ($ci = 0; $ci -lt $lines.Count; $ci++) {
      $cline = $lines[$ci].Trim()
      if ($cline -match '^\s*(//|\*|/\*\*)') { continue }
      if ($cline -match '\?\s*[^:]*?\?\s*[^:]*?:') {
        Warn "C15-NESTED-TERNARY" $fname "L$($ci+1)" "                                                                        "
      }
    }

    #           C16:                                               
    if ($fname -match '\.tsx$' -and $fname -notmatch '^(page|layout|loading|error|not-found)\.tsx$') {
      $txBaseName = $fname -replace '\.(desktop|mobile)?\.tsx$', ''
      $txBaseName = $txBaseName -replace '\.tsx$', ''
      $expectedExport = ($txBaseName -split '-').ForEach({ $_.Substring(0,1).ToUpper() + $_.Substring(1) }) -join ''
      $exportMatch = [regex]::Matches($content, 'export (?:default )?function (\w+)')
      $foundMatch = $false
      foreach ($em in $exportMatch) {
        if ($em.Groups[1].Value -eq $expectedExport) { $foundMatch = $true; break }
      }
      # Check each exported function against expected name (handle multiple exports)
      if (-not $foundMatch -and $exportMatch.Count -gt 0) {
        $actualNames = ($exportMatch | ForEach-Object { $_.Groups[1].Value }) -join ', '
        Warn "C16-COMPONENT-NAME" $fname "" "component exports '$actualNames' do not match expected '$expectedExport' from filename '$txBaseName'"
      }
    }

    #           U8:              aria-label                 
    $interactiveTags = @("button", "input", "select", "textarea", "a")
    foreach ($tagName in $interactiveTags) {
      $tagPattern = "<${tagName}\b[^>]*>|<${tagName}\b[\s\S]*?>"
      $tagMatches = [regex]::Matches($content, $tagPattern)
      foreach ($tm in $tagMatches) {
        $tagContent = $tm.Groups[0].Value
        if ($tagContent -match "aria-label\s*=") { continue }
        if ($tagContent -match "aria-labelledby\s*=") { continue }
        if ($tagContent -match 'type\s*=\s*"hidden"') { continue }
        if ($tagContent -match 'role\s*=\s*"tab"') { continue }
        if ($tagContent -match 'role\s*=\s*"presentation"') { continue }
        if ($tagName -eq "input" -and $tagContent -match 'type\s*=\s*"checkbox"') { continue }
        if ($tagName -eq "input" -and $tagContent -match 'type\s*=\s*"radio"') { continue }
        if ($tagName -eq "input" -and $tagContent -match 'type\s*=\s*"submit"') { continue }
        $lineNum = ($content.Substring(0, $tm.Index).Split("`n")).Count
        Warn "U8-ARIA-LABEL" $fname "L$lineNum" "             &lt;$tagName&gt;        aria-label     aria-labelledby       "
      }
    }
  }
}

#                                                                                                                                                                      
#              src/          
#                                                                                                                                                                      
$scanDirs = @(
  @{ Path=(Join-Path $SrcDir "mods"); Label="mods" },
  @{ Path=(Join-Path $SrcDir "core"); Label="core" },
  @{ Path=(Join-Path $SrcDir "foundation"); Label="foundation" },
  @{ Path=(Join-Path $SrcDir "app"); Label="app" }
)

foreach ($dir in $scanDirs) {
  Scan-UiForDirectory $dir.Path $dir.Label
}

# ============================================================
# F1: _internal/ directory protection
# ============================================================
Write-Host "  [F1] Checking _internal/ dirs..." -ForegroundColor DarkGray
$allModDirs = @(Get-ChildItem -Path (Join-Path $SrcDir "mods") -Directory | Where-Object { $_.Name -match '^mod-' })
# Pass 1: collect MODs with non-empty _internal/ dirs
$modsWithInternal = @{}
foreach ($md in $allModDirs) {
  $internalDir = Join-Path $md.FullName "_internal"
  if (Test-Path $internalDir) {
    $internalFiles = @(Get-ChildItem -Path $internalDir -Recurse -Filter "*.ts" -File -ErrorAction SilentlyContinue)
    if ($internalFiles.Count -gt 0) {
      $modsWithInternal[$md.Name] = $true
    }
  }
}
# Pass 2: single scan of all src files (skip _internal/ files themselves)
if ($modsWithInternal.Count -gt 0) {
  $allSrcFilesF1 = if ($AllSrcFiles) { $AllSrcFiles } else { @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue) }
  foreach ($sf in $allSrcFilesF1) {
    # skip files inside _internal/ dirs
    if ($sf.FullName -match '[\\/]_internal[\\/]') { continue }
    $sfc = Get-FileContent $sf.FullName
    if (-not $sfc) { continue }
    foreach ($mn in $modsWithInternal.Keys) {
      if ($sfc -match [regex]::Escape("$mn/_internal")) {
        Warn "F1-INTERNAL-LEAK" $sf.Name "" "imports _internal/ from $mn (forbidden)"
      }
    }
  }
}

#                                                                                                                                                                      
# U3: Component layering rules (Atom/Molecule/Organism)
#                                                                                                                                                                      
Write-Host "  [U3] Checking component layering..." -ForegroundColor DarkGray
$compDirs = @()
$modCompDirs = Get-ChildItem -Path (Join-Path $SrcDir "mods") -Directory | Where-Object { $_.Name -match '^mod-' }
foreach ($mcd in $modCompDirs) {
  $cd = Join-Path $mcd.FullName "components"
  if (Test-Path $cd) { $compDirs += $cd }
}
foreach ($cd in $compDirs) {
  $atomsDir = Join-Path $cd "atoms"
  $moleculesDir = Join-Path $cd "molecules"
  $organismsDir = Join-Path $cd "organisms"
  foreach ($dirInfo in @(@{Path=$atomsDir;Level="Atom"}, @{Path=$moleculesDir;Level="Molecule"}, @{Path=$organismsDir;Level="Organism"})) {
    if (-not (Test-Path $dirInfo.Path)) { continue }
    $compTsxFiles = @(Get-ChildItem -Path $dirInfo.Path -Filter "*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch "\.types\.|^index\." })
    foreach ($cf in $compTsxFiles) {
      $cc = Get-FileContent $cf.FullName
      if (-not $cc) { continue }
      $cfRel = $cf.Name
      if ($dirInfo.Level -eq "Atom") {
        if ($cc -match '\buseState\b|\buseCallback\b|\buseEffect\b|\buseRef\b|\buseMemo\b') {
          Warn "U3-ATOM-HOOK" $cfRel "" "Atom component should not use React Hooks"
        }
      }
      if ($dirInfo.Level -in @("Atom","Molecule")) {
        if ($cc -match '\buse\w+Store\b') {
          Warn "U3-LAYER-STORE" $cfRel "" "$($dirInfo.Level) component should not access Store directly"
        }
      }
    }
  }
}

# The unified pass intentionally stays one traversal, but its rule body has its own owner file.
. (Join-Path $PSScriptRoot 'ui-scanner/tsx-rules.ps1')

# ============================================================
# U15: Root layout must have <html lang="...">
# ============================================================
Write-Host "  [U15] Checking root layout html lang..." -ForegroundColor DarkGray
$layoutPath = Join-Path $SrcDir "app\layout.tsx"
if (Test-Path $layoutPath) {
  $layoutContent = Get-FileContent $layoutPath
  if ($layoutContent) {
    if ($layoutContent -match '<html\b' -and $layoutContent -notmatch '<html\b[^>]*\blang\s*=') {
      Warn "U15-HTML-LANG" "src/app/layout.tsx" "" "<html> tag missing lang attribute (should be <html lang='zh-CN'>)"
    }
  }
}
