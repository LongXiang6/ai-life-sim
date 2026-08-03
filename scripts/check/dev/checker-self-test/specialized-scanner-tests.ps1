# Purpose: Run the specialized scanner ownership and composition regression.
# Owner: quality:infrastructure
# Responsibility: Checker self-test phase 3 delegation and result projection only.

Write-SectionHeader 'Test 3: Specialized Scanner Contract'

$scannerContractPath = Join-Path $checkDir 'domains/structural/specialized-scanner-contract-smoke.mjs'
$scannerContractOutput = @(& node $scannerContractPath 2>&1)
$scannerContractPassed = ($LASTEXITCODE -eq 0)
$scannerContractDetail = if ($scannerContractPassed) {
  $scannerContractOutput -join '; '
} else {
  ($scannerContractOutput | Select-Object -First 5) -join '; '
}
Write-TestResult '3-SPECIALIZED-SCANNERS' $scannerContractPassed $scannerContractDetail
