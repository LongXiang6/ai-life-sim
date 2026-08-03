# Purpose: Validate that TypeScript import paths resolve to real files.
# Owner: quality:mod
# Responsibility: D6 import path existence assertions only.

# === D6: Import path resolution ===
Write-Host "  [D6] Checking import paths..." -ForegroundColor DarkGray

# $allTsFiles shared from orchestrator if available, else compute
if (-not $AllSrcFiles) {
  $AllSrcFiles = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' })
}
$allTsFiles = $AllSrcFiles

foreach ($f in $allTsFiles) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $fileDir = Split-Path $f.FullName -Parent
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  $importMatches = [regex]::Matches($fc, "from\s+'([^']+)'")
  foreach ($im in $importMatches) {
    $importPath = $im.Groups[1].Value
    if ($importPath -notmatch '^[.@]') { continue }

    $resolved = $null

    if ($importPath -match '^@/(.+)') {
      $resolved = Join-Path $SrcDir $Matches[1]
    } elseif ($importPath -match '^\.\.?/') {
      $combined = Join-Path $fileDir $importPath
      $resolved = [System.IO.Path]::GetFullPath($combined)
    }

    if ($resolved -and -not (Test-FileExists $resolved)) {
      Fail "D6-IMPORT" $relFP "" "Import path not found: '$importPath'"
    }
  }
}
