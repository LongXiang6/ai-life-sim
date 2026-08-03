# Purpose: Validate Manifest prompt declarations against prompt source files.
# Owner: quality:mod
# Responsibility: D11 prompt directory, missing file, and extra file assertions only.

# === D11: Prompt registration chain ===
Write-Host "  [D11] Checking prompt chain..." -ForegroundColor DarkGray

function Test-PromptFileExists($declaredName, $actualNames) {
  if ($actualNames.ContainsKey($declaredName)) { return $true }
  if ($actualNames.ContainsKey("${declaredName}-prompt")) { return $true }
  if ($declaredName -match '-prompt$') {
    $short = $declaredName -replace '-prompt$', ''
    if ($actualNames.ContainsKey($short)) { return $true }
  }
  return $false
}

function Test-PromptDeclaredInManifest($fileBase, $declaredPrompts) {
  if ($fileBase -in $declaredPrompts) { return $true }
  if ("${fileBase}-prompt" -in $declaredPrompts) { return $true }
  if ($fileBase -match '-prompt$') {
    $short = $fileBase -replace '-prompt$', ''
    if ($short -in $declaredPrompts) { return $true }
  }
  return $false
}

foreach ($mn in $AllModInfo.Keys) {
  $info = $AllModInfo[$mn]
  $promptsMatch = [regex]::Match($info.ManContent, "prompts:\s*\[([^\]]*)\]")
  if (-not $promptsMatch.Success) { continue }
  $raw = $promptsMatch.Groups[1].Value -replace "[\s']", ""
  $declaredPrompts = if ($raw) { $raw -split "," | Where-Object { $_ } } else { @() }
  if ($declaredPrompts.Count -eq 0) { continue }

  $promptsDir = Join-Path $info.Path "prompts"
  if (-not (Test-Path $promptsDir)) {
    Fail "D11-PROMPT-DIR" $mn "" "manifest declares prompts but prompts/ dir missing"
    continue
  }
  $actualFiles = @(Get-ChildItem -Path $promptsDir -Filter "*.ts" -File | Where-Object { $_.Name -ne "index.ts" })
  $actualNames = @{}
  foreach ($pf in $actualFiles) {
    $base = $pf.Name -replace "\.ts$", ""
    $actualNames[$base] = $pf.Name
  }

  foreach ($dp in $declaredPrompts) {
    if (-not (Test-PromptFileExists $dp $actualNames)) {
      Fail "D11-PROMPT-MISSING" $mn "" "manifest declares prompt '$dp' but file not found in prompts/ (supports name or name-prompt.ts)"
    }
  }
  foreach ($an in $actualNames.Keys) {
    if (-not (Test-PromptDeclaredInManifest $an $declaredPrompts)) {
      Warn "D11-PROMPT-EXTRA" $mn "" "prompts/$($actualNames[$an]) exists but not registered in manifest"
    }
  }
}
