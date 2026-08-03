# Purpose: Validate the single application entry allowed to import globals.css.
# Owner: quality:ui
# Responsibility: U16 global stylesheet import assertions only.

Add-UiTsxCheck {
  param($file)
  if ($file.Content -notmatch 'globals\.css') { return }
  $relativePath = $file.RelativePath -replace '^src/', ''
  if ($relativePath -ne 'app/layout.tsx') {
    Fail 'U16-GLOBALS-IMPORT' $relativePath '' 'globals.css must only be imported from src/app/layout.tsx'
  }
}
