# MOD architecture domain: arch + smart + anomaly
param(
  [string]$Path = 'src/mods',
  [string]$ModName = '',
  [switch]$VerboseOutput,
  [switch]$ErrorOnly
)

$checkDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$criticalMode = $env:CHECK_STEP_MODE -eq 'critical'
$scannerSet = if ($criticalMode) { 'arch' } else { 'arch,smart,anomaly' }
& (Join-Path $checkDir 'check-format.ps1') -Path $Path -ModName $ModName `
  -VerboseOutput:$VerboseOutput.IsPresent -ErrorOnly:$ErrorOnly.IsPresent `
  -Scanners $scannerSet

exit $LASTEXITCODE
