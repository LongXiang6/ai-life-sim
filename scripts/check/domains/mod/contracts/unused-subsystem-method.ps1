# Purpose: Diagnose public subsystem methods that are unreachable from cached project source.
# Owner: quality:mod
# Responsibility: D34 non-lifecycle subsystem method reachability assertions only.

$subsystemLifecycleMethods = @(
  'collectState',
  'applyChanges',
  'reset',
  'advance',
  'collectStateUpdate',
  'collectStateFinalFix'
)
$emDash = [char]0x2014

foreach ($modDirectory in $modDirs) {
  $manifestPath = Join-Path $modDirectory.FullName 'manifest.ts'
  if (-not (Test-Path $manifestPath)) { continue }
  $manifestContent = Get-FileContent $manifestPath
  if (-not $manifestContent) { continue }
  $subsystemClassMatches = [regex]::Matches($manifestContent, "class:\s*'(\w+)'")
  if ($subsystemClassMatches.Count -eq 0) { continue }

  $subsystemDirectory = Join-Path $modDirectory.FullName 'subsystems'
  if (-not (Test-Path $subsystemDirectory)) { continue }
  $subsystemFiles = @(
    Get-ChildItem -LiteralPath $subsystemDirectory -Filter '*.ts' -File |
      Where-Object { $_.Name -ne 'index.ts' }
  )

  foreach ($classMatch in $subsystemClassMatches) {
    $className = $classMatch.Groups[1].Value
    $subsystemFile = $subsystemFiles | Where-Object {
      (Get-FileContent $_.FullName) -match "class $className"
    } | Select-Object -First 1
    if (-not $subsystemFile) { continue }

    $content = Get-FileContent $subsystemFile.FullName
    $relativePath = "src/mods/$($modDirectory.Name)/subsystems/$($subsystemFile.Name)"
    $methodMatches = [regex]::Matches(
      $content,
      '^\s*(?:public\s+|async\s+)?(?:public\s+)?(?:async\s+)?(\w+)\s*\('
    )
    foreach ($methodMatch in $methodMatches) {
      $methodName = $methodMatch.Groups[1].Value
      if ($methodName -eq 'constructor' -or $methodName -in $subsystemLifecycleMethods -or $methodName.StartsWith('_')) {
        continue
      }

      $referenced = $false
      if ($identifierFilesByName.ContainsKey($methodName)) {
        foreach ($referencePath in $identifierFilesByName[$methodName]) {
          if (-not [string]::Equals(
            $referencePath,
            $subsystemFile.FullName,
            [System.StringComparison]::OrdinalIgnoreCase
          )) {
            $referenced = $true
            break
          }
        }
      }
      if ($referenced) { continue }

      $indexPath = Join-Path $modDirectory.FullName 'index.ts'
      if ((Test-Path $indexPath) -and (Get-FileContent $indexPath) -match $methodName) { continue }
      Warn 'D34-METHOD-UNUSED' $relativePath '' "public method '$className.$methodName()' is not called by any file $emDash may indicate dead code"
    }
  }
}
