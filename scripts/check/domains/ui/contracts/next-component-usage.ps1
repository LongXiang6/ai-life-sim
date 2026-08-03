# Purpose: Validate Next.js Link and Image component use in TSX.
# Owner: quality:ui
# Responsibility: U13 anchor and U14 native image tag assertions only.

Add-UiTsxCheck {
  param($file)
  $anchorCount = [regex]::Matches($file.Content, '<a\b[^>]*\bhref\s*=').Count
  if ($anchorCount -gt 0) {
    Warn 'U13-NO-A-TAG' $file.FileName '' "Found $anchorCount <a href> tag(s). Use next/Link <Link href> instead"
  }
  foreach ($imageMatch in [regex]::Matches($file.Content, '<img\b[^>]*>')) {
    $lineNumber = ($file.Content.Substring(0, $imageMatch.Index).Split("`n")).Count
    Warn 'U14-NO-IMG-TAG' $file.FileName "L$lineNumber" 'Use next/Image <Image> component instead of <img> tag'
  }
}
