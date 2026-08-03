# Purpose: Run UI rules U4, U9-U14, and U16 in one cached TSX traversal.
# Owner: UI static analysis
# Responsibility: Per-file TSX rule evaluation and aggregate UI scan counts only.

Write-Host "  [U4/U9/U10/U11/U12/U13/U14/U16] Unified TSX scan (8 checks in 1 pass)..." -ForegroundColor DarkGray
$gcssPattern = "globals\.css"

foreach ($tf in $AllTsxFiles) {
  $tc = Get-FileContent $tf.FullName
  if (-not $tc) { continue }
  $relPath = $tf.FullName.Substring($SrcDir.Length + 1).Replace('\','/')

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

  if ($tc -match '<a\b[^>]*\bhref\s*=') {
    $aMatches = [regex]::Matches($tc, '<a\b[^>]*\bhref\s*=')
    $aCount = $aMatches.Count
    if ($aCount -gt 0) {
      Warn "U13-NO-A-TAG" $tf.Name "" "Found $aCount <a href> tag(s). Use next/Link <Link href> instead"
    }
  }

  $imgTagMatches = [regex]::Matches($tc, '<img\b[^>]*>')
  foreach ($im in $imgTagMatches) {
    $lineNum = ($tc.Substring(0, $im.Index).Split("`n")).Count
    Warn "U14-NO-IMG-TAG" $tf.Name "L$lineNum" "Use next/Image <Image> component instead of <img> tag"
  }

  if ($tc -match $gcssPattern) {
    if ($relPath -ne 'src/app/layout.tsx' -and $relPath -ne 'app/layout.tsx') {
      Fail "U16-GLOBALS-IMPORT" $relPath "" "globals.css must only be imported from src/app/layout.tsx"
    }
  }
}

$uiErrors = $E.Errors - $startErrors
$uiWarnings = $E.Warnings - $startWarnings
Write-Host "  UI             : $uiErrors       , $uiWarnings       " -ForegroundColor $(if ($uiErrors -gt 0) { "Red" } else { "Green" })
