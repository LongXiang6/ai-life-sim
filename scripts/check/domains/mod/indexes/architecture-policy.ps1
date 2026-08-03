# Purpose: Load configured secondary public imports and generated boundary exceptions.
# Owner: quality:mod
# Responsibility: Parse architecture-rules.json public-boundary policy only.

$Script:AllowedSecondaryPublicImports = @{}
$Script:GeneratedPublicBoundaryExceptions = @()
$Script:ArchitecturePolicyLoadError = $null
$architectureRulesPath = Join-Path $checkDir 'rules/architecture-rules.json'
if (Test-Path $architectureRulesPath) {
  try {
    $architectureRules = Get-FileContent $architectureRulesPath | ConvertFrom-Json
    if ($architectureRules.allowedSecondaryPublicImports) {
      foreach ($property in $architectureRules.allowedSecondaryPublicImports.PSObject.Properties) {
        $Script:AllowedSecondaryPublicImports[$property.Name] = @($property.Value)
      }
    }
    if ($architectureRules.generatedPublicBoundaryExceptions) {
      $Script:GeneratedPublicBoundaryExceptions = @($architectureRules.generatedPublicBoundaryExceptions)
    }
  } catch {
    $Script:ArchitecturePolicyLoadError = 'Failed to parse architecture-rules.json'
  }
}
