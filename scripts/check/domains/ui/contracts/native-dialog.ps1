# Purpose: Detect native blocking browser dialogs in UI source.
# Owner: quality:ui
# Responsibility: U1 alert, confirm, and prompt assertions only.

Add-UiTsxCheck {
  param($file)
  for ($lineIndex = 0; $lineIndex -lt $file.Lines.Count; $lineIndex++) {
    $line = $file.Lines[$lineIndex].Trim()
    if ($line -match '^\s*(//|\*|/\*\*)') { continue }
    if ($line -match '\b(alert|confirm|prompt)\s*\(') {
      Warn 'U1-ALERT' $file.RelativePath "L$($lineIndex + 1)" '             alert/confirm/prompt                      Modal/Toast'
    }
  }
}
