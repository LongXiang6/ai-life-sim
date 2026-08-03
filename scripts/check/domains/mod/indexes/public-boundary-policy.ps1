# Purpose: Answer whether a generated source path is exempt from public-boundary checks.
# Owner: quality:mod
# Responsibility: Generated public-boundary exception lookup only.

function Test-IsGeneratedPublicBoundaryException($relativePath) {
  $normalized = $relativePath.Replace('\', '/')
  foreach ($prefix in $Script:GeneratedPublicBoundaryExceptions) {
    if ($normalized.StartsWith(([string]$prefix).Replace('\', '/'))) { return $true }
  }
  return $false
}
