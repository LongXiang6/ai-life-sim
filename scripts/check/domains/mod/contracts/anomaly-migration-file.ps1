# Purpose: Validate MOD migration file naming and migrate export shape.
# Owner: quality:mod
# Responsibility: A11 migration name and export assertions only.

# ============================================================
# A11: Migration file naming convention
#      Checks migrations/*.ts files follow {x.y.z}-{x.y.z}.ts
#      and export a `migrate` function.
#      Absorbs Factorio migrations/ directory convention.
# ============================================================
Write-Host "  [A11] Checking migration file conventions..." -ForegroundColor DarkGray

$a11StartErrors = $E.Errors
$a11StartWarnings = $E.Warnings

$allModDirsA11 = @(Get-ChildItem -Path $modsDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^mod-' })
foreach ($md in $allModDirsA11) {
  $migDir = Join-Path $md.FullName "migrations"
  if (-not (Test-Path $migDir)) { continue }
  $migFiles = @(Get-ChildItem -Path $migDir -Filter "*.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'index.ts' })
  foreach ($mf in $migFiles) {
    $mfContent = Get-FileContent $mf.FullName
    $relFP = $mf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")
    $baseName = $mf.Name -replace '\.ts$', ''

    # Check naming: {semver}-{semver}.ts e.g. 1.0.0-1.0.1.ts
    if ($baseName -notmatch '^\d+\.\d+\.\d+-\d+\.\d+\.\d+$') {
      Fail "A11-MIGRATION-NAME" $relFP "" "Migration file name must be '{fromVersion}-{toVersion}.ts' (semver to semver). Found: '$($mf.Name)'"
    }

    # Check exports `migrate` function (as named or default)
    if ($mfContent -and $mfContent -notmatch 'export\s+(?:async\s+)?function\s+migrate\b' -and $mfContent -notmatch 'migrate\s*:') {
      Fail "A11-MIGRATION-EXPORT" $relFP "" "Migration file must export a 'migrate' function. Found no export matching that pattern."
    }
  }
}
