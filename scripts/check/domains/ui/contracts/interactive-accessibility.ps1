# Purpose: Validate accessible names, image text, touch size, keyboard input, and local color contrast.
# Owner: quality:ui
# Responsibility: U8-U12 interactive accessibility assertions only.

Add-UiTsxCheck {
  param($file)
  foreach ($tagName in @('button', 'input', 'select', 'textarea', 'a')) {
    foreach ($tagMatch in [regex]::Matches($file.Content, "<${tagName}\b[^>]*>|<${tagName}\b[\s\S]*?>")) {
      $tagContent = $tagMatch.Groups[0].Value
      if ($tagContent -match 'aria-label\s*=|aria-labelledby\s*=|type\s*=\s*"hidden"|role\s*=\s*"(tab|presentation)"') { continue }
      if ($tagName -eq 'input' -and $tagContent -match 'type\s*=\s*"(checkbox|radio|submit)"') { continue }
      $lineNumber = ($file.Content.Substring(0, $tagMatch.Index).Split("`n")).Count
      Warn 'U8-ARIA-LABEL' $file.RelativePath "L$lineNumber" "             &lt;$tagName&gt;        aria-label     aria-labelledby       "
    }
  }

  foreach ($imageMatch in [regex]::Matches($file.Content, '<img\b[^>]*/?>')) {
    if ($imageMatch.Groups[0].Value -notmatch '\balt\s*=') {
      $lineNumber = ($file.Content.Substring(0, $imageMatch.Index).Split("`n")).Count
      Warn 'U9-IMG-ALT' $file.FileName "L$lineNumber" '<img> tag missing alt attribute'
    }
  }
  foreach ($imageMatch in [regex]::Matches($file.Content, '<Image\b[^>]*/?>')) {
    if ($imageMatch.Groups[0].Value -notmatch '\balt\s*=') {
      $lineNumber = ($file.Content.Substring(0, $imageMatch.Index).Split("`n")).Count
      Warn 'U9-IMG-ALT' $file.FileName "L$lineNumber" '<Image> component missing alt attribute'
    }
  }

  foreach ($elementMatch in [regex]::Matches($file.Content, '<(?:button|a|input)(?!.*type\s*=\s*"hidden")[^>]*>')) {
    if ($elementMatch.Groups[0].Value -match '\b(?:w-|h-|size-)(\d+)') {
      $size = [int]$Matches[1]
      if ($size -gt 0 -and $size -lt 11) {
        $lineNumber = ($file.Content.Substring(0, $elementMatch.Index).Split("`n")).Count
        Warn 'U10-TOUCH-TARGET' $file.FileName "L$lineNumber" "Interactive element has size class w-/h-/size-$size (${size}rem < 44px minimum)"
      }
    }
  }

  foreach ($clickMatch in [regex]::Matches($file.Content, 'onClick\s*=\s*\{')) {
    $contextStart = [Math]::Max(0, $clickMatch.Index - 100)
    $contextLength = [Math]::Min(300, $file.Content.Length - $contextStart)
    $contextText = $file.Content.Substring($contextStart, $contextLength)
    if ($contextText -match 'onKeyDown|onKeyUp|onKeyPress') { continue }
    $before = $file.Content.Substring([Math]::Max(0, $clickMatch.Index - 200), [Math]::Min(200, $clickMatch.Index))
    if ($before -match '<(div|span|li|td|tr)\b[^>]*$') {
      $lineNumber = ($file.Content.Substring(0, $clickMatch.Index).Split("`n")).Count
      Warn 'U11-KEYBOARD' $file.FileName "L$lineNumber" 'onClick on non-interactive element without onKeyDown handler'
    }
  }

  $hexColors = [regex]::Matches($file.Content, '#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b')
  for ($index = 0; $index -lt $hexColors.Count - 1; $index++) {
    if ($hexColors[$index + 1].Index - $hexColors[$index].Index -gt 300) { continue }
    $left = $hexColors[$index].Groups[1].Value
    $right = $hexColors[$index + 1].Groups[1].Value
    if ($left.Length -eq 3) { $left = "$($left[0])$($left[0])$($left[1])$($left[1])$($left[2])$($left[2])" }
    if ($right.Length -eq 3) { $right = "$($right[0])$($right[0])$($right[1])$($right[1])$($right[2])$($right[2])" }
    $leftLum = 0.299 * ([Convert]::ToInt32($left.Substring(0, 2), 16) / 255.0) + 0.587 * ([Convert]::ToInt32($left.Substring(2, 2), 16) / 255.0) + 0.114 * ([Convert]::ToInt32($left.Substring(4, 2), 16) / 255.0)
    $rightLum = 0.299 * ([Convert]::ToInt32($right.Substring(0, 2), 16) / 255.0) + 0.587 * ([Convert]::ToInt32($right.Substring(2, 2), 16) / 255.0) + 0.114 * ([Convert]::ToInt32($right.Substring(4, 2), 16) / 255.0)
    $contrast = if ($leftLum -gt $rightLum) { ($leftLum + 0.05) / ($rightLum + 0.05) } else { ($rightLum + 0.05) / ($leftLum + 0.05) }
    if ($contrast -lt 3.0) {
      $lineNumber = ($file.Content.Substring(0, $hexColors[$index].Index).Split("`n")).Count
      Warn 'U12-CONTRAST' $file.FileName "L$lineNumber" "Low color contrast (~$([math]::Round($contrast, 1)):1) between #$left and #$right (min 3.0 for large text, 4.5 for normal)"
    }
  }
}
