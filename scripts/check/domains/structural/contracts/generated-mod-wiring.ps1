# Purpose: Validate generated MOD wiring freshness and importer completeness.
# Owner: quality:structural
# Responsibility: D35 codegen drift and generated MOD importer assertions only.

# 2.5c D35: MOD Wiring Codegen Freshness Check
# -------------------------------------------------------
Write-Host ""
Write-Host "========================================================"
Write-Host "  D35 MOD Wiring Codegen Check"
Write-Host "========================================================" -ForegroundColor Cyan

$d35StartErrors = $E.Errors
$emDash = [char]0x2014
$genScript = Join-Path $scriptsRoot "codegen/generate-mod-wiring.mjs"

if (Test-Path $genScript) {
  $genOutput = & node $genScript --check 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    Fail "D35-WIRING-STALE" "scripts/codegen/generate-mod-wiring.mjs" "" "Generated wiring files are out of date. Run: npm run generate:wiring"
    if ($VerboseOutput) { Write-Host $genOutput -ForegroundColor DarkGray }
  }

  # 有 subsystems 声明的 MOD 必须出现在 mod-importers.generated.ts
  $importersPath = Join-Path $projectRoot "src/core/mod-loader/mod-importers.generated.ts"
  if (Test-Path $importersPath) {
    $importersContent = Get-FileContent $importersPath
    foreach ($md in $modDirs) {
      $mp = Join-Path $md.FullName "manifest.ts"
      if (-not (Test-Path $mp)) { continue }
      $mc = Get-FileContent $mp
      if (-not $mc) { continue }
      if ($mc -notmatch "subsystems:\s*\[") { continue }
      $subMatch = [regex]::Match($mc, "subsystems:\s*\[([^\]]+)\]")
      if (-not $subMatch.Success) { continue }
      $subRaw = $subMatch.Groups[1].Value.Trim()
      if (-not $subRaw -or $subRaw -eq '') { continue }
      $mn = $md.Name
      if ($importersContent -notmatch "'$mn'") {
        Fail "D35-MOD-IMPORTER-MISSING" "src/core/mod-loader/mod-importers.generated.ts" "" "MOD '$mn' has subsystems but missing from MOD_IMPORTERS $emDash run npm run generate:wiring"
      }
    }
  }
} else {
  Write-Host "  [SKIP] generate-mod-wiring.mjs not found" -ForegroundColor DarkGray
}

$d35Errors = $E.Errors - $d35StartErrors
Write-Host "  D35 : $d35Errors errors" -ForegroundColor $(if ($d35Errors -gt 0) { "Red" } else { "Green" })
