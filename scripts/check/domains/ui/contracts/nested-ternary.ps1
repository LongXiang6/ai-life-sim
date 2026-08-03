# Purpose: Detect nested ternary expressions that reduce UI readability.
# Owner: quality:ui
# Responsibility: C15 nested ternary assertions only.

Add-UiTsxCheck {
  param($file)
  for ($lineIndex = 0; $lineIndex -lt $file.Lines.Count; $lineIndex++) {
    $line = $file.Lines[$lineIndex].Trim()
    if ($line -match '^\s*(//|\*|/\*\*)') { continue }
    if ($line -match '\?\s*[^:]*?\?\s*[^:]*?:') {
      Warn 'C15-NESTED-TERNARY' $file.RelativePath "L$($lineIndex + 1)" '                                                                        '
    }
  }
}
