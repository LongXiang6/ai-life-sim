# Purpose: Coordinate the selected local scanners and focused post-scan phases.
# Owner: quality:infrastructure
# Responsibility: Resolve inputs and load scanner, post-pass, and summary components in fixed order.

<#
.SYNOPSIS
          -                
.DESCRIPTION
          
    arch-scanner   -    C1-C14, C18-C19, D1-D5, D25-D29, D33, E1, F1-F4, P1, C10, C13, G1-G10, H1-H4 
    post-scan      -    D19-D21, D34
    css-scanner    -    S16, S24-S26 (S1-S6, S16-S23, C8 consolidated)
    ui-scanner     - UI U1-U2, U4, U9-U16, C15-C16, F1 
       code-architecture-skill + mod-engine-skill
.PARAMETER Path
       MOD       src/mods
.PARAMETER ModName
       MOD       mod-power-system
.PARAMETER VerboseOutput
.PARAMETER ReportFile
                        (Add-Content)
.EXAMPLE
  powershell -File scripts/check/check-format.ps1
  powershell -File scripts/check/check-format.ps1 -ModName mod-engine
  powershell -File scripts/check/check-format.ps1 -VerboseOutput
  powershell -File scripts/check/check-format.ps1 -ReportFile reports/checker.log
#>

param(
  [string]$Path = "src/mods",
  [string]$ModName = "",
  [switch]$VerboseOutput = $false,
  [string]$ReportFile = "",
  [string]$OutputDir = "",
  [switch]$ErrorOnly = $false,
  [string]$Scanners = "arch,ui,css,smart,anomaly"
)

$ErrorActionPreference = "Continue"
$Global:ErrorOnly = $ErrorOnly.IsPresent
$Global:QuietConsole = ($env:CHECK_QUIET -eq '1')
if ($Global:QuietConsole -and -not $ErrorOnly.IsPresent) {
  $Global:ErrorOnly = $true
}
$ActiveScanners = @($Scanners -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$RunModPostScan = ($ActiveScanners -contains 'arch' -or $ActiveScanners -contains 'smart' -or $ActiveScanners -contains 'anomaly')

# Resolve default OutputDir to project root's reports/ directory
$checkDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptsRoot = Split-Path -Parent $checkDir
$projectRoot = Split-Path -Parent $scriptsRoot
if (-not $OutputDir) {
  $OutputDir = Join-Path $projectRoot "reports"
}

# -------------------------------------------------------
# 0.       
# -------------------------------------------------------
. (Join-Path $checkDir "lib/checker-utils.ps1")

$modScannerDir = [System.IO.Path]::Combine($checkDir, "domains", "mod")
$uiScannerDir = [System.IO.Path]::Combine($checkDir, "domains", "ui")

function Resolve-ScannerPath([string]$Name) {
  switch ($Name) {
    'arch'    { return Join-Path $modScannerDir 'arch-scanner.ps1' }
    'smart'   { return Join-Path $modScannerDir 'smart-scanner.ps1' }
    'anomaly' { return Join-Path $modScannerDir 'anomaly-scanner.ps1' }
    'ui'      { return Join-Path $uiScannerDir 'ui-scanner.ps1' }
    'css'     { return Join-Path $uiScannerDir 'css-scanner.ps1' }
    default   { return [System.IO.Path]::Combine($checkDir, "domains", "$Name", "$Name-scanner.ps1") }
  }
}

function Invoke-ScannerScript([string]$Name, [string]$ScannerPath) {
  if (-not $ScannerPath -or -not (Test-Path $ScannerPath)) {
    Fail "SCANNER-MISSING" "scripts/check" "" "scanner '$Name' not found: $ScannerPath"
    return
  }

  $prevErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Stop"
    . $ScannerPath
  } catch {
    Fail "SCANNER-EXEC" "scripts/check" "" "scanner '$Name' failed: $($_.Exception.Message)"
  } finally {
    $ErrorActionPreference = $prevErrorActionPreference
  }
}

# -------------------------------------------------------
# 1.       
# -------------------------------------------------------
$modsDir = Join-Path (Get-Location) $Path
if (-not (Test-Path $modsDir)) {
  Write-Host "   MOD       $modsDir" -ForegroundColor Red
  exit 1
}

if ($ModName) {
  $modDirs = @(Get-ChildItem -Path $modsDir -Directory | Where-Object { $_.Name -eq $ModName })
  if ($modDirs.Count -eq 0) {
    Write-Host "       MOD $ModName" -ForegroundColor Red
    exit 1
  }
} else {
  $modDirs = @(Get-ChildItem -Path $modsDir -Directory | Where-Object { $_.Name -match '^mod-' })
}

#    src/        style-scanner / ui-scanner    
$SrcDir = Split-Path $modsDir -Parent

# Encoding is validated by the standardization gate; scanners remain read-only.

# -------------------------------------------------------
# 1.1            src             Get-ChildItem 
# -------------------------------------------------------
$AllSrcFiles = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' })
$AllTsFiles  = @($AllSrcFiles | Where-Object { $_.Extension -eq '.ts' })
$AllTsxFiles = @($AllSrcFiles | Where-Object { $_.Extension -eq '.tsx' })

# Preload the already enumerated file set once into the shared cache.
foreach ($sourceFile in $AllSrcFiles) {
  [void](Get-FileContent $sourceFile.FullName)
}

# Setup output persistence
Set-OutputOptions $OutputDir $false

if (-not $Global:QuietConsole) {
  Write-Host ""
  Write-Host "========================================================"
  Write-Host "  Architecture & Code Quality Checker"
  Write-Host "     code-architecture-skill v4.0 + mod-engine-skill v1.0"
  Write-Host "     $($modDirs.Count) MODs + core/foundation/app"
  Write-Host "========================================================"
}

foreach ($sn in $ActiveScanners) {
  $sp = Resolve-ScannerPath $sn
  Invoke-ScannerScript $sn $sp
}

# Defensive: ensure $E is still a hashtable after scanners
if ($E -isnot [hashtable]) {
  Write-Host "  [WARN] Counter state corrupted, reinitializing..." -ForegroundColor DarkYellow
  $E = @{ Total=0; Errors=0; Warnings=0; Pass=0 }
}

$checkFormatRoot = Join-Path $checkDir 'check-format'
. (Join-Path $checkFormatRoot 'smart-comparison.ps1')
. (Join-Path $checkFormatRoot 'architecture-post-passes.ps1')
. (Join-Path $checkFormatRoot 'summary.ps1')
