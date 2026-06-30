# MOD architecture domain: arch + smart + anomaly
param(
  [string]$Path = 'src/mods',
  [string]$ModName = '',
  [switch]$VerboseOutput,
  [switch]$ErrorOnly
)

$checkDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
& (Join-Path $checkDir 'check-format.ps1') -Path $Path -ModName $ModName `
  -VerboseOutput:$VerboseOutput.IsPresent -ErrorOnly:$ErrorOnly.IsPresent `
  -Scanners 'arch,smart,anomaly'
