# Purpose: Validate the root application document language attribute.
# Owner: quality:ui
# Responsibility: U15 root html lang assertions only.

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
