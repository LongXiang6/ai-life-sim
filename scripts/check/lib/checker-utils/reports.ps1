# Purpose: Persist checker results as JSON, Markdown, and HTML reports.
# Owner: quality:infrastructure
# Responsibility: Report cleanup, output configuration, and deterministic rendering only.

if (-not (Get-Variable -Name CheckerOutputDir -Scope Global -ErrorAction SilentlyContinue)) {
  $Global:CheckerOutputDir = $null
}
if (-not (Get-Variable -Name CheckerJsonOnly -Scope Global -ErrorAction SilentlyContinue)) {
  $Global:CheckerJsonOnly = $false
}
$reportComponentsRoot = Join-Path $PSScriptRoot 'report-renderers'
. (Join-Path $reportComponentsRoot 'html-report.ps1')
. (Join-Path $reportComponentsRoot 'markdown-report.ps1')

function Clear-OldCheckerReports {
  param(
    [string]$OutputDir,
    [int]$MaxAgeMinutes = 10
  )

  if (-not $OutputDir) { return }
  if (-not (Test-Path $OutputDir)) { return }

  $cutoff = (Get-Date).AddMinutes(-1 * $MaxAgeMinutes)
  $patterns = @(
    "check-run-*.json",
    "check-run-*.md",
    "check-log-*.txt",
    "checker-*.json",
    "checker-*.md",
    "report.html"
  )

  $deleted = 0
  foreach ($pattern in $patterns) {
    $files = @(Get-ChildItem -Path $OutputDir -File -Filter $pattern -ErrorAction SilentlyContinue)
    foreach ($file in $files) {
      if ($file.LastWriteTime -ge $cutoff) { continue }

      try {
        Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
        $deleted++
      } catch {
        if ($env:CHECK_CLEAN_REPORTS_VERBOSE -eq '1') {
          Write-Host "  [check:cleanup] cannot delete $($file.Name): $_" -ForegroundColor Yellow
        }
      }
    }
  }

  if ($env:CHECK_CLEAN_REPORTS_VERBOSE -eq '1' -and $deleted -gt 0) {
    Write-Host "  [check:cleanup] deleted $deleted old report file(s)" -ForegroundColor DarkGray
  }
}

function Set-OutputOptions($outputDir, $jsonOnly) {
  $Global:CheckerOutputDir = $outputDir
  $Global:CheckerJsonOnly = $jsonOnly
  Clear-OldCheckerReports $outputDir
}

function Save-Reports {
  param($modCount)
  if (-not $Global:CheckerOutputDir) { return }

  if (-not (Test-Path $Global:CheckerOutputDir)) {
    New-Item -ItemType Directory -Path $Global:CheckerOutputDir -Force | Out-Null
  }

  $timestamp = "$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')-$PID"
  $summary = @{
    Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    ModCount = $modCount
    Total = $E.Total
    Errors = $E.Errors
    Warnings = $E.Warnings
    Pass = $E.Pass
  }

  # Category statistics
  $categoryStats = @{}
  foreach ($r in $Results) {
    $cat = ($r.Rule -replace '-.*', '')
    if (-not $categoryStats.ContainsKey($cat)) {
      $categoryStats[$cat] = @{ Errors=0; Warnings=0 }
    }
    if ($r.Level -eq 'ERROR') { $categoryStats[$cat].Errors++ }
    else { $categoryStats[$cat].Warnings++ }
  }
  $summary.Categories = $categoryStats

  # Errors by file
  $fileStats = @{}
  foreach ($r in $Results) {
    if (-not $fileStats.ContainsKey($r.File)) {
      $fileStats[$r.File] = @{ Errors=0; Warnings=0 }
    }
    if ($r.Level -eq 'ERROR') { $fileStats[$r.File].Errors++ }
    else { $fileStats[$r.File].Warnings++ }
  }
  $summary.TopFiles = ($fileStats.GetEnumerator() | Sort-Object { $_.Value.Errors + $_.Value.Warnings } -Descending | Select-Object -First 20 | ForEach-Object { @{ File=$_.Key; Errors=$_.Value.Errors; Warnings=$_.Value.Warnings } })

  # Errors by rule
  $ruleStats = @{}
  foreach ($r in $Results) {
    if (-not $ruleStats.ContainsKey($r.Rule)) {
      $ruleStats[$r.Rule] = 0
    }
    $ruleStats[$r.Rule]++
  }
  $summary.TopRules = ($ruleStats.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 20 | ForEach-Object { @{ Rule=$_.Key; Count=$_.Value } })

  # Save JSON report (pretty-printed with line breaks)
  $jsonPath = Join-Path $Global:CheckerOutputDir "checker-${timestamp}.json"
  $jsonData = @{
    Summary = $summary
    Results = @($Results | ForEach-Object { @{ Level=$_.Level; Rule=$_.Rule; File=$_.File; Line=$_.Line; Message=$_.Message; Module=$_.Module } })
  }
  $jsonData | ConvertTo-Json -Depth 6 | Set-Content -Path $jsonPath -Encoding UTF8
  if ($env:CHECK_QUIET -ne '1') {
    Write-Host "  Report saved: $jsonPath" -ForegroundColor DarkGray
  }

  if ($Global:CheckerJsonOnly) { return }

  Save-MarkdownCheckerReport $summary $modCount $categoryStats $ruleStats $Results $Global:CheckerOutputDir $timestamp
  Save-HtmlCheckerReport $summary $modCount $Results $Global:CheckerOutputDir
}
