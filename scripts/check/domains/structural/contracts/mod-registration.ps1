# Purpose: Validate that every MOD is reachable from the application registration entry.
# Owner: quality:structural
# Responsibility: D31 generated registry and legacy init-mods registration assertions only.

# === D31: Check init-mods.tsx includes all MODs ===
Write-Host "  [D31] Checking init-mods.tsx module completeness..." -ForegroundColor DarkGray
$d31StartErrors = $E.Errors
$d31StartWarnings = $E.Warnings
$emDash = [char]0x2014
$initModsPath = Join-Path $projectRoot "src\app\_components\init-mods.tsx"
if (Test-Path $initModsPath) {
  $initContent = Get-FileContent $initModsPath
  if ($initContent) {
    $registrationEntryContent = $initContent
    foreach ($entryFile in @('init-mods-routes.ts', 'init-mods-bootstrap.ts')) {
      $entryPath = Join-Path $projectRoot "src\app\_components\${entryFile}"
      if (Test-Path $entryPath) {
        $registrationEntryContent += "`n" + (Get-FileContent $entryPath)
      }
    }

    # Pattern 1: centralized generated registry, including dynamically loaded
    # route/bootstrap leaves used to keep the first viewport bundle light.
    if ($registrationEntryContent -match "(?:from\s+|import\()'@/mods/registry'") {
      $registryPaths = @(
        (Join-Path $projectRoot "src\mods\registry.generated.ts"),
        (Join-Path $projectRoot "src\mods\registry.ts")
      )
      $registeredMods = @()
      foreach ($registryPath in $registryPaths) {
        if (-not (Test-Path $registryPath)) { continue }
        $regContent = Get-FileContent $registryPath
        if (-not $regContent) { continue }
        $manifestImports = [regex]::Matches($regContent, "import\s+\w+Manifest\s+from\s+'\./(mod-[a-z0-9-]+)/manifest'")
        foreach ($mi in $manifestImports) { $registeredMods += $mi.Groups[1].Value }
      }
      $registeredMods = @($registeredMods | Select-Object -Unique)
      if ($registeredMods.Count -eq 0) {
        Fail "D31-NO-REGISTRY" "src/mods/registry.ts" "" "registry.generated.ts missing or empty $emDash run npm run generate:wiring"
      } else {
        foreach ($md in $modDirs) {
          $mn = $md.Name
          if ($mn -notin $registeredMods) {
            Fail "D31-UNREGISTERED-MOD" "src/mods/registry.generated.ts" "" "MOD '$mn' exists in src/mods/ but is not registered $emDash run npm run generate:wiring"
          }
        }
        Write-Host "    Detected codegen registry pattern ($($registeredMods.Count) MODs registered)" -ForegroundColor DarkGray
      }
    }
    # Pattern 2: individual manifest imports (legacy)
    else {
      $importedMods = @()
      $importMatches = [regex]::Matches($initContent, "from\s+'@/mods/(mod-[a-z0-9-]+)/manifest'")
      foreach ($im in $importMatches) { $importedMods += $im.Groups[1].Value }

      foreach ($md in $modDirs) {
        $mn = $md.Name
        if ($mn -notin $importedMods) {
          Fail "D31-UNIMPORTED-MOD" "src/app/_components/init-mods.tsx" "" "MOD '$mn' exists in src/mods/ but is not imported in init-mods.tsx ALL_MANIFESTS"
        }
      }
    }
  }
}
$d31Errors = $E.Errors - $d31StartErrors
$d31Warnings = $E.Warnings - $d31StartWarnings
Write-Host "  D31-IMPORTED    : $d31Errors errors, $d31Warnings warnings" -ForegroundColor $(if ($d31Errors -gt 0) { "Red" } elseif ($d31Warnings -gt 0) { "Yellow" } else { "Green" })
