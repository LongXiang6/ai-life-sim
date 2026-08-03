# Purpose: Detect inline UI styles that bypass shared spacing and color tokens.
# Owner: quality:ui
# Responsibility: U2 and U4 inline style, hardcoded spacing, and hardcoded color assertions only.

Add-UiTsxCheck {
  param($file)
  for ($lineIndex = 0; $lineIndex -lt $file.Lines.Count; $lineIndex++) {
    $line = $file.Lines[$lineIndex].Trim()
    if ($line -match '^\s*(//|\*|/\*\*)') { continue }
    if ($line -match 'style=\{\{') {
      if ($line -match '\d+px') {
        Warn 'U2-INLINE-STYLE' $file.RelativePath "L$($lineIndex + 1)" '       style                                   TailwindCSS        Design Token'
      } else {
        Warn 'U2-INLINE-STYLE' $file.RelativePath "L$($lineIndex + 1)" '             style                      TailwindCSS    '
      }
    }
  }

  $hardcodedCount = 0
  foreach ($colorMatch in [regex]::Matches($file.Content, '#[0-9a-fA-F]{3,8}(?![\w-])')) {
    $index = $colorMatch.Index
    $before = $file.Content.Substring([Math]::Max(0, $index - 20), [Math]::Min(20, $index))
    if ($before -match 'var\(--color|#[0-9a-fA-F]{3,8}\s*\]') { continue }
    $hardcodedCount++
  }
  if ($hardcodedCount -gt 0) {
    Warn 'U4-HARDCODED-COLOR' $file.FileName '' "detected ~$hardcodedCount hardcoded hex color(s), should use var(--color-xxx) Design Token"
  }
  if ([regex]::Matches($file.Content, 'style\s*=\s*\{').Count -gt 0 -and
      [regex]::Matches($file.Content, 'style\s*=\s*\{[^}]*?\b(margin|padding|gap|fontSize|font-size)\s*:').Count -gt 0) {
    Warn 'U4-HARDCODED-STYLE' $file.FileName '' 'Inline style uses hardcoded spacing/font-size. Use Tailwind className or CSS variable instead'
  }
}
