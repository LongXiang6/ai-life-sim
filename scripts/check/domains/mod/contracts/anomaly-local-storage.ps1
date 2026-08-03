# Purpose: Detect direct localStorage access inside MOD source.
# Owner: quality:mod
# Responsibility: A12 MOD storage isolation assertions only.

# ============================================================
# A12: Direct localStorage usage in MOD code
#      MODs should use context.getStorage() for per-MOD namespace
#      isolation instead of raw localStorage access.
#      Absorbs Factorio per-MOD storage isolation design.
# ============================================================
Write-Host "  [A12] Checking for direct localStorage in MODs..." -ForegroundColor DarkGray

$a12StartErrors = $E.Errors
$a12StartWarnings = $E.Warnings

# Only check files under mods/, exclude core/ and foundation/
$modFilesA12 = @(Get-ChildItem -Path $modsDir -Recurse -Include "*.ts", "*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -notin @('index.ts', 'manifest.ts') })

# Files intentionally using localStorage (justified exceptions):
#   DisclaimerModal.tsx — reads disclaimer acceptance flag at earliest boot time,
#     before any store initialization. Lightweight boolean, no namespacing needed.
$A12_EXCLUSIONS = @(
  'mods/mod-ui/components/organisms/DisclaimerModal.tsx'
)

foreach ($mf in $modFilesA12) {
  $mfc = Get-FileContent $mf.FullName
  if (-not $mfc) { continue }
  $relFP = $mf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Skip justified exclusions
  if ($A12_EXCLUSIONS -contains $relFP) { continue }

  # Check for raw localStorage usage
  if ($mfc -match 'localStorage\.(getItem|setItem|removeItem|clear)\s*\(') {
    $lineNum = ($mfc.Substring(0, ($mfc | Select-String 'localStorage\.(?:getItem|setItem|removeItem|clear)\s*\(' | Select-Object -First 1).Matches[0].Index) -split "`n").Count
    Warn "A12-STORAGE-LEAK" $relFP "L$lineNum" "Direct localStorage access detected. Use context.getStorage() for per-MOD namespace isolation instead."
  }
}
