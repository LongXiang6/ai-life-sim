# Purpose: Detect forbidden legacy UI theme identifiers.
# Owner: quality:ui
# Responsibility: C18 theme ID whitelist assertions only.

# === C18: Theme ID whitelist ===
Write-Host "  [C18] Checking theme IDs..." -ForegroundColor DarkGray
$c18StartErrors = $E.Errors
$c18StartWarnings = $E.Warnings
$validThemes = @('default','dark','cultivation','wuxia','scifi','apocalypse')
$forbiddenThemes = @('xianxia','cyberpunk','medieval','fantasy','modern','steampunk')
$allModFiles186 = $AllSrcFiles
foreach ($f in $allModFiles186) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  foreach ($ft in $forbiddenThemes) {
  if (($fc -match "\btheme\b.*\b${ft}\b") -or ($fc -match "\b${ft}\b.*\btheme\b")) {
      $rel = $f.FullName.Substring($SrcDir.Length + 1).Replace('\','/')
      Warn "C18-THEME-ID" $rel "" "Contains forbidden legacy theme ID '$ft'. Use one of: $($validThemes -join ', ')"
    }
  }
}
$c18Errors = $E.Errors - $c18StartErrors
$c18Warnings = $E.Warnings - $c18StartWarnings
Write-Host "  C18-THEME-ID   : $c18Errors errors, $c18Warnings warnings" -ForegroundColor $(if ($c18Errors -gt 0) { "Red" } elseif ($c18Warnings -gt 0) { "Yellow" } else { "Green" })
