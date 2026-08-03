# Purpose: Diagnose default imports from another MOD public entrypoint.
# Owner: quality:mod
# Responsibility: D17 default cross-MOD import assertions only.

# === D17: Default import check ===
Write-Host "  [D17] Checking default imports from MODs..." -ForegroundColor DarkGray

foreach ($f in $allTsFiles2) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  $defaultImports = [regex]::Matches($fc, "import\s+(\w+)\s+from\s+'@/mods/(mod-[a-z0-9-]+)'")
  foreach ($di in $defaultImports) {
    $impName = $di.Groups[1].Value
    $targetMod = $di.Groups[2].Value
    $ownMod = ""
    if ($relFP -match '^src/mods/(mod-[a-z0-9-]+)/') { $ownMod = $Matches[1] }
    if ($targetMod -eq $ownMod) { continue }
    if ($f.Name -ne "manifest.ts" -and $relFP -notmatch 'manifest\.ts$') {
      Warn "D17-DEFAULT-IMPORT" $relFP "" "Uses default import '$impName' from '$targetMod', recommend using named import"
    }
  }
}
