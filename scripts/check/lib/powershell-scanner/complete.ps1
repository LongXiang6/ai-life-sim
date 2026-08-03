# Purpose: Publish one specialized PowerShell scanner node result.
# Owner: quality:infrastructure
# Responsibility: Compact console status, structured report persistence, and process exit only.

param(
  [Parameter(Mandatory = $true)]
  [string]$ContractId
)

if ($Global:QuietConsole) {
  if ($E.Errors -gt 0) {
    Write-Host "[scanner:$ContractId] FAIL - $($E.Errors) error(s), $($E.Warnings) warning(s)" -ForegroundColor Red
  } else {
    Write-Host "[scanner:$ContractId] PASS - $($E.Pass) pass(es), $($E.Warnings) warning(s)" -ForegroundColor Green
  }
} else {
  Write-Host ''
  Write-Host "[$ContractId] total=$($E.Total) fail=$($E.Errors) warn=$($E.Warnings) pass=$($E.Pass)"
}

Save-Reports $modDirs.Count
if ($E.Errors -gt 0) { exit 1 }
exit 0
