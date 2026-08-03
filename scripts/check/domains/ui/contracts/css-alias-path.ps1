# Purpose: Detect unsupported TypeScript path aliases inside CSS imports and URLs.
# Owner: quality:ui
# Responsibility: S16 CSS alias path assertions only.

foreach ($cssFile in $cssFiles) {
  $content = Get-FileContent $cssFile.FullName
  if (-not $content) { continue }
  $relativePath = $cssFile.FullName.Substring($SrcDir.Length + 1).Replace('\', '/')
  $lines = $content -split "`n"
  for ($lineIndex = 0; $lineIndex -lt $lines.Count; $lineIndex++) {
    if ($lines[$lineIndex] -match '@import\s+[''"]@/') {
      Fail 'S16-CSS-PATH' $relativePath "L$($lineIndex + 1)" "CSS @import does not support TS @/* aliases. Use relative path instead (e.g. '../foundation/tokens/index.css')"
    }
    if ($lines[$lineIndex] -match 'url\s*\(\s*[''"]@/') {
      Fail 'S16-CSS-PATH' $relativePath "L$($lineIndex + 1)" "CSS url() does not support TS @/* aliases. Use relative path instead (e.g. '../assets/bg.png')"
    }
  }
}
