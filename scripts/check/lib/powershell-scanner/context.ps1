# Purpose: Build one read-only source index for a specialized PowerShell scanner node.
# Owner: quality:infrastructure
# Responsibility: Resolve paths, select source files, preload text, and initialize report state only.

param(
  [string]$Path = 'src/mods',
  [string]$ModName = '',
  [string[]]$Extensions = @('.ts', '.tsx'),
  [switch]$VerboseOutput,
  [switch]$ErrorOnly
)

$ErrorActionPreference = 'Continue'
$Global:ErrorOnly = $ErrorOnly.IsPresent
$Global:QuietConsole = ($env:CHECK_QUIET -eq '1')
if ($Global:QuietConsole -and -not $ErrorOnly.IsPresent) {
  $Global:ErrorOnly = $true
}

$checkDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$scriptsRoot = Split-Path -Parent $checkDir
$projectRoot = Split-Path -Parent $scriptsRoot
. (Join-Path $checkDir 'lib/checker-utils.ps1')

$modsDir = Join-Path (Get-Location) $Path
if (-not (Test-Path $modsDir -PathType Container)) {
  Write-Host "[scanner] MOD root missing: $modsDir" -ForegroundColor Red
  exit 1
}

if ($ModName) {
  $modDirs = @(Get-ChildItem -LiteralPath $modsDir -Directory | Where-Object { $_.Name -eq $ModName })
  if ($modDirs.Count -eq 0) {
    Write-Host "[scanner] MOD not found: $ModName" -ForegroundColor Red
    exit 1
  }
} else {
  $modDirs = @(Get-ChildItem -LiteralPath $modsDir -Directory | Where-Object { $_.Name -match '^mod-' })
}

$SrcDir = Split-Path $modsDir -Parent
$extensionSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($extension in $Extensions) {
  if ($extension) { [void]$extensionSet.Add($extension) }
}

if ($extensionSet.Count -gt 0) {
  $AllSrcFiles = @(
    Get-ChildItem -LiteralPath $SrcDir -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object {
        $extensionSet.Contains($_.Extension) -and
        $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]'
      }
  )
} else {
  $AllSrcFiles = @()
}
$AllTsFiles = @($AllSrcFiles | Where-Object { $_.Extension -eq '.ts' })
$AllTsxFiles = @($AllSrcFiles | Where-Object { $_.Extension -eq '.tsx' })

foreach ($sourceFile in $AllSrcFiles) {
  [void](Get-FileContent $sourceFile.FullName)
}

$OutputDir = Join-Path $projectRoot 'reports'
Set-OutputOptions $OutputDir $Global:QuietConsole
