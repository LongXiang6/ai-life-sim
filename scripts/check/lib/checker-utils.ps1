# Purpose: Load the shared checker utilities from focused infrastructure components.
# Owner: quality:infrastructure
# Responsibility: Initialize shared result state and dot-source the stable utility surface only.

$ErrorActionPreference = "Continue"

if (-not (Get-Variable -Name E -ErrorAction SilentlyContinue)) {
  $E = @{ Total=0; Errors=0; Warnings=0; Pass=0 }
}
if (-not (Get-Variable -Name Results -ErrorAction SilentlyContinue)) {
  $Results = [System.Collections.ArrayList]::new()
}

$checkerUtilsRoot = Join-Path $PSScriptRoot 'checker-utils'
. (Join-Path $checkerUtilsRoot 'encoding.ps1')
. (Join-Path $checkerUtilsRoot 'file-cache.ps1')
. (Join-Path $checkerUtilsRoot 'rule-inspection.ps1')
. (Join-Path $checkerUtilsRoot 'reports.ps1')
. (Join-Path $checkerUtilsRoot 'results.ps1')
