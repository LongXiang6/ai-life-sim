# ui-scanner.ps1     UI                
#             U1 (alert/confirm/prompt) | U2 (inline style) | C15 (nested ternary) | C16 (component name) | U4 (hardcoded style) | U13 (no <a> tag) | U14 (no <img> tag) | U15 (html lang) | U16 (globals.css import)
#                 .tsx       
#          checker-utils.ps1                      dot-source   

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

#                                                                                                                                                                      
# Unified TSX file scan: U4 (Design Token) | U9 (img alt) | U10 (touch targets)  
#                         U11 (keyboard nav) | U12 (color contrast) | U13 (<a> tags)
#                         U14 (<img> tags) | U16 (globals.css)
#                                                                                                                                                                      
# All 8 checks merged into a single pass over $AllTsxFiles,
# eliminating 7 redundant file traversals and I/O operations.
#                                                                                                                                                                      
Write-Host "  [U4/U9/U10/U11/U12/U13/U14/U16] Unified TSX scan (8 checks in 1 pass)..." -ForegroundColor DarkGray

# U16 needs this pre-declared for the unified loop
$gcssPattern = "globals\.css"

foreach ($tf in $AllTsxFiles) {
  $tc = Get-FileContent $tf.FullName
  if (-not $tc) { continue }
  # Pre-compute relative path (used by U16 and others that need full path context)
  $relPath = $tf.FullName.Substring($SrcDir.Length + 1).Replace('\','/')

  # ===== U4: Design Token usage =====
  $hexColorMatches = [regex]::Matches($tc, '#[0-9a-fA-F]{3,8}(?![\w-])')
  $hardcodedCount = 0
  foreach ($hcm in $hexColorMatches) {
    $ctx = $hcm.Index
    $before = $tc.Substring([Math]::Max(0, $ctx - 20), [Math]::Min(20, $ctx))
    if ($before -match "var\(--color|#[0-9a-fA-F]{3,8}\s*\]") { continue }
    $hardcodedCount++
  }
  if ($hardcodedCount -gt 0) {
    Warn "U4-HARDCODED-COLOR" $tf.Name "" "detected ~$hardcodedCount hardcoded hex color(s), should use var(--color-xxx) Design Token"
  }

  $styleMatches = [regex]::Matches($tc, 'style\s*=\s*\{')
  if ($styleMatches.Count -gt 0) {
    $spacingMatches = [regex]::Matches($tc, 'style\s*=\s*\{[^}]*?\b(margin|padding|gap|fontSize|font-size)\s*:')
    if ($spacingMatches.Count -gt 0) {
      Warn "U4-HARDCODED-STYLE" $tf.Name "" "Inline style uses hardcoded spacing/font-size. Use Tailwind className or CSS variable instead"
    }
  }

  # ===== U9: Image alt attributes =====
  $imgMatches = [regex]::Matches($tc, '<img\b[^>]*/?>')
  foreach ($img in $imgMatches) {
    $imgTag = $img.Groups[0].Value
    if ($imgTag -notmatch '\balt\s*=') {
      $lineNum = ($tc.Substring(0, $img.Index).Split("`n")).Count
      Warn "U9-IMG-ALT" $tf.Name "L$lineNum" "<img> tag missing alt attribute"
    }
  }
  $nextImgMatches = [regex]::Matches($tc, '<Image\b[^>]*/?>')
  foreach ($ni in $nextImgMatches) {
    $niTag = $ni.Groups[0].Value
    if ($niTag -notmatch '\balt\s*=') {
      $lineNum = ($tc.Substring(0, $ni.Index).Split("`n")).Count
      Warn "U9-IMG-ALT" $tf.Name "L$lineNum" "<Image> component missing alt attribute"
    }
  }

  # ===== U10: Touch target minimum 44px =====
  $interactiveElements = [regex]::Matches($tc, '<(?:button|a|input)(?!.*type\s*=\s*"hidden")[^>]*>')
  foreach ($ie in $interactiveElements) {
    $element = $ie.Groups[0].Value
    if ($element -match '\b(?:w-|h-|size-)(\d+)') {
      $twSize = [int]$Matches[1]
      if ($twSize -gt 0 -and $twSize -lt 11) {
        $lineNum = ($tc.Substring(0, $ie.Index).Split("`n")).Count
        Warn "U10-TOUCH-TARGET" $tf.Name "L$lineNum" "Interactive element has size class w-/h-/size-$twSize (${twSize}rem < 44px minimum)"
      }
    }
  }

  # ===== U11: Keyboard navigation =====
  $onClickMatches = [regex]::Matches($tc, 'onClick\s*=\s*\{')
  foreach ($oc in $onClickMatches) {
    $ctxStart = [Math]::Max(0, $oc.Index - 100)
    $ctxLen = [Math]::Min(300, $tc.Length - $ctxStart)
    $ctx = $tc.Substring($ctxStart, $ctxLen)
    if ($ctx -notmatch 'onKeyDown' -and $ctx -notmatch 'onKeyUp' -and $ctx -notmatch 'onKeyPress') {
      $beforeCtx = $tc.Substring([Math]::Max(0, $oc.Index - 200), [Math]::Min(200, $oc.Index))
      if ($beforeCtx -match '<(div|span|li|td|tr)\b[^>]*$') {
        $lineNum = ($tc.Substring(0, $oc.Index).Split("`n")).Count
        Warn "U11-KEYBOARD" $tf.Name "L$lineNum" "onClick on non-interactive element without onKeyDown handler"
      }
    }
  }

  # ===== U12: Color contrast =====
  $hexColors = [regex]::Matches($tc, '#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b')
  if ($hexColors.Count -ge 2) {
    for ($hi = 0; $hi -lt $hexColors.Count - 1; $hi++) {
      $c1 = $hexColors[$hi].Groups[1].Value
      $c2 = $hexColors[$hi + 1].Groups[1].Value
      if ($hexColors[$hi + 1].Index - $hexColors[$hi].Index -gt 300) { continue }
      if ($c1.Length -eq 3) { $c1 = "$($c1[0])$($c1[0])$($c1[1])$($c1[1])$($c1[2])$($c1[2])" }
      if ($c2.Length -eq 3) { $c2 = "$($c2[0])$($c2[0])$($c2[1])$($c2[1])$($c2[2])$($c2[2])" }
      $r1 = [Convert]::ToInt32($c1.Substring(0,2), 16) / 255.0
      $g1 = [Convert]::ToInt32($c1.Substring(2,2), 16) / 255.0
      $b1 = [Convert]::ToInt32($c1.Substring(4,2), 16) / 255.0
      $r2 = [Convert]::ToInt32($c2.Substring(0,2), 16) / 255.0
      $g2 = [Convert]::ToInt32($c2.Substring(2,2), 16) / 255.0
      $b2 = [Convert]::ToInt32($c2.Substring(4,2), 16) / 255.0
      $lum1 = 0.299*$r1 + 0.587*$g1 + 0.114*$b1
      $lum2 = 0.299*$r2 + 0.587*$g2 + 0.114*$b2
      $contrast = if ($lum1 -gt $lum2) { ($lum1 + 0.05) / ($lum2 + 0.05) } else { ($lum2 + 0.05) / ($lum1 + 0.05) }
      if ($contrast -lt 3.0) {
        $lineNum = ($tc.Substring(0, $hexColors[$hi].Index).Split("`n")).Count
        Warn "U12-CONTRAST" $tf.Name "L$lineNum" "Low color contrast (~$([math]::Round($contrast,1)):1) between #$c1 and #$c2 (min 3.0 for large text, 4.5 for normal)"
      }
    }
  }

  # ===== U13: No <a href> — use next/Link =====
  if ($tc -match '<a\b[^>]*\bhref\s*=') {
    $aMatches = [regex]::Matches($tc, '<a\b[^>]*\bhref\s*=')
    $aCount = $aMatches.Count
    if ($aCount -gt 0) {
      Warn "U13-NO-A-TAG" $tf.Name "" "Found $aCount <a href> tag(s). Use next/Link <Link href> instead"
    }
  }

  # ===== U14: No <img> — use next/Image =====
  $imgTagMatches = [regex]::Matches($tc, '<img\b[^>]*>')
  foreach ($im in $imgTagMatches) {
    $lineNum = ($tc.Substring(0, $im.Index).Split("`n")).Count
    Warn "U14-NO-IMG-TAG" $tf.Name "L$lineNum" "Use next/Image <Image> component instead of <img> tag"
  }

  # ===== U16: globals.css import location =====
  if ($tc -match $gcssPattern) {
    if ($relPath -ne 'src/app/layout.tsx' -and $relPath -ne 'app/layout.tsx') {
      Fail "U16-GLOBALS-IMPORT" $relPath "" "globals.css must only be imported from src/app/layout.tsx"
    }
  }
}

$uiErrors = $E.Errors - $startErrors
$uiWarnings = $E.Warnings - $startWarnings
Write-Host "  UI             : $uiErrors       , $uiWarnings       " -ForegroundColor $(if ($uiErrors -gt 0) { "Red" } else { "Green" })

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
