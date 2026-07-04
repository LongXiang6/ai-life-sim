$ErrorActionPreference = "Continue"

$E = @{ Total=0; Errors=0; Warnings=0; Pass=0 }
$Results = [System.Collections.ArrayList]::new()

# ============================================================
# Encoding pre-check: validate PowerShell scripts are valid UTF-8
# ============================================================
function Test-ScriptEncoding($scriptDir) {
  Write-Host "  Checking PowerShell script encoding..." -ForegroundColor DarkGray
  $psFiles = @(Get-ChildItem -Path $scriptDir -Recurse -Include "*.ps1","*.psm1" -File -ErrorAction SilentlyContinue)
  $fixed = 0
  $failed = 0

  foreach ($f in $psFiles) {
    try {
      # Read raw bytes
      $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
      if ($bytes.Count -eq 0) { continue }

      # Check for BOM
      $hasBOM = ($bytes.Count -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)

      # Try to decode as UTF-8
      $utf8 = [System.Text.UTF8Encoding]::new($false, $false)
      $text = $utf8.GetString($bytes)

      # Check for common corruption markers (replacement characters, NUL bytes, BOM garbage)
      $hasNul = $bytes -contains 0x00
      $hasReplacement = $text.Contains([char]0xFFFD)
      # UTF-16 LE detection: every other byte is 0x00 for ASCII chars
      $possibleUtf16 = $false
      if ($bytes.Count -gt 4 -and $bytes[1] -eq 0x00 -and $bytes[3] -eq 0x00 -and $bytes[0] -ne 0x00) {
        $possibleUtf16 = $true
      }

      if ($hasNul -or $possibleUtf16) {
        # Try reading as UTF-16 LE and convert to UTF-8
        try {
          $corrected = [System.Text.Encoding]::Unicode.GetString($bytes)
          $utf8WithBOM = [System.Text.UTF8Encoding]::new($true)
          [System.IO.File]::WriteAllBytes($f.FullName, $utf8WithBOM.GetBytes($corrected))
          $fixed++
          Write-Host "    Fixed encoding: $($f.Name) (UTF-16 → UTF-8+BOM)" -ForegroundColor Yellow
        } catch {
          $failed++
          Write-Host "    FAILED to fix: $($f.Name) - $_" -ForegroundColor Red
        }
        continue
      }

      if ($hasReplacement) {
        $failed++
        Write-Host "    CORRUPTED: $($f.Name) contains undecodable bytes" -ForegroundColor Red
        continue
      }

      # Ensure BOM is present (PowerShell 5.x prefers UTF-8 with BOM)
      if (-not $hasBOM) {
        try {
          $utf8WithBOM = [System.Text.UTF8Encoding]::new($true)
          [System.IO.File]::WriteAllBytes($f.FullName, $utf8WithBOM.GetBytes($text))
          $fixed++
          Write-Host "    Added BOM: $($f.Name)" -ForegroundColor DarkGray
        } catch {
          $failed++
        }
      }
    } catch {
      $failed++
      Write-Host "    ERROR reading: $($f.Name) - $_" -ForegroundColor Red
    }
  }

  if ($fixed -gt 0) {
    Write-Host "  Encoding: fixed $fixed script file(s)" -ForegroundColor $(if ($fixed -gt 0) { "Yellow" } else { "Green" })
  }
  if ($failed -gt 0) {
    Write-Host "  Encoding: $failed file(s) could NOT be fixed automatically" -ForegroundColor Red
  }
  if ($fixed -eq 0 -and $failed -eq 0) {
    Write-Host "  Encoding: all scripts OK" -ForegroundColor Green
  }
}

# Shared file content cache for performance
$Script:FileContentCache = @{}
$Script:CacheEnabled = $true

function Get-FileContent($filePath) {
  if ($Script:CacheEnabled -and $Script:FileContentCache.ContainsKey($filePath)) {
    return $Script:FileContentCache[$filePath]
  }
  try {
    $content = [System.IO.File]::ReadAllText($filePath, [System.Text.UTF8Encoding]::new($true, $true))
  } catch {
    $content = $null
  }
  if ($Script:CacheEnabled) {
    $Script:FileContentCache[$filePath] = $content
  }
  return $content
}

function Preload-AllFiles($srcDir) {
  Write-Host "  Preloading all source files..." -ForegroundColor DarkGray
  $allFiles = @(Get-ChildItem -Path $srcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' })
  foreach ($f in $allFiles) {
    $Script:FileContentCache[$f.FullName] = Get-FileContent $f.FullName
  }
  Write-Host "  Preloaded $($Script:FileContentCache.Count) files" -ForegroundColor DarkGray
}

function Clear-FileCache {
  $Script:FileContentCache = @{}
}

# ============================================================
# Invoke-FileChecks: Unified file traversal framework
# ============================================================
# Eliminates redundant file I/O by running multiple check scriptblocks
# in a single pass over the file list. Each check receives a context
# hashtable with .FilePath, .FileName, .Content, and .Lines.
#
# Usage:
#   Invoke-FileChecks -Files $allTsxFiles -Checks @(
#     { param($f) if ($f.Content -match 'bad') { Warn "X" $f.FileName "" "msg" } },
#     { param($f) ... }
#   )
# ============================================================
function Invoke-FileChecks {
  param(
    [object[]]$Files,
    [scriptblock[]]$Checks
  )

  foreach ($f in $Files) {
    $filePath = if ($f -is [string]) { $f } else { $f.FullName }
    $content = Get-FileContent $filePath
    if (-not $content) { continue }

    $ctx = @{
      FilePath = $filePath
      FileName = Split-Path $filePath -Leaf
      FullName = $filePath
      Content  = $content
      Lines    = $content -split "`n"
    }

    foreach ($check in $Checks) {
      & $check $ctx
    }
  }
}

# ============================================================
# Skill Rules Mapping Library
# ============================================================
# Maps code elements to skill rule requirements for smart comparison

$SkillRules = @{
  # File-level rules
  FileOrder = @{
    Description = "File header order: use client -> JSDoc -> react -> next -> core/foundation -> mods -> relative -> type"
    Patterns = @(
      "^(?:'use client';?)?\s*$",
      "^/\*\*[\s\S]*?\*/\s*$",
      "^import\s+.*from\s+'react'",
      "^import\s+.*from\s+'next'",
      "^import\s+.*from\s+'@/core|^import\s+.*from\s+'@/foundation",
      "^import\s+.*from\s+'@/mods/",
      "^import\s+.*from\s+'\./|^import\s+.*from\s+'\.\./",
      "^import\s+type\s+"
    )
  }

  # Class internal code order
  ClassOrder = @{
    Description = "readonly metadata -> private state -> constructor -> interface methods -> public methods -> private methods"
    OrderedSections = @(
      "readonly\s+(id|mod|label|description)\s*=",
      "private\s+\w",
      "constructor\s*\(",
      "(?:collectState|applyChanges|reset)\s*\(",
      "public\s+\w+\s*\(",
      "private\s+\w+\s*\("
    )
  }

  # Function internal logic order
  FunctionOrder = @{
    Description = "parameter validation -> core computation -> return result"
    ValidationPatterns = @("if\s*\(!|if\s*\(typeof|throw\s+new\s+Error")
    ReturnPattern = "return\s+"
  }

  # Naming convention rules
  NamingRules = @{
    ModDir     = '^mod-[a-z0-9]+(-[a-z0-9]+)*$'
    SubsystemFile = '^[a-z0-9]+(-[a-z0-9]+)*-system\.ts$'
    SubsystemClass = '^[A-Z][a-zA-Z]+System$'
    Hook       = '^use[A-Z][a-zA-Z]+$'
    Store      = '^use[A-Z][a-zA-Z]+Store$'
    Const      = '^[A-Z][A-Z0-9_]+$'
    EventName  = '^mod-[a-z-]+:[a-z]+-[a-z-]+$'
    StorageKey = '^mod-[a-z0-9-]+:(?:config|save|cache|temp):[a-z0-9-]+$'
  }

  # Critical subsystem methods that must exist in order
  SubsystemMethods = @{
    Required = @("collectState", "applyChanges", "reset")
    Order = @("collectState", "applyChanges", "reset")
  }

  # File purity rules: what each file type should contain
  FilePurity = @{
    "types.ts"      = @{ Allowed=@("interface","type","enum","import"); Forbidden=@("export const","export function","export class") }
    "constants.ts"  = @{ Allowed=@("export const [A-Z]"); Forbidden=@("export interface","export type","export enum","export function","export class") }
    "utils.ts"      = @{ Allowed=@("export function","export const"); Forbidden=@("export interface","export type","export enum","use[A-Z]") }
    "store.ts"      = @{ Allowed=@("use\w+Store","create(","devtools","persist"); Forbidden=@("export interface","export type","export enum") }
    "hooks.ts"      = @{ Allowed=@("export function use","export const use"); Forbidden=@("export interface","export type","export enum","export const [A-Z_]") }
    "manifest.ts"   = @{ Allowed=@("defineMod"); Forbidden=@("export const","export function","export interface","export type","export class") }
    "index.ts"      = @{ Allowed=@("export {"); Forbidden=@("export \*","export const","export function","export class") }
  }
}

# Smart function position checker: verifies critical methods appear in correct order
function Test-FunctionOrder($fileContent, $filePath, $methodList, $contextLabel) {
  $lines = $fileContent -split "`n"
  $foundMethods = @{}
  foreach ($method in $methodList) {
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match "^\s*(?:public\s+|private\s+|protected\s+)?${method}\s*\(") {
        $foundMethods[$method] = $i
        break
      }
    }
  }

  # Check all required methods exist
  $allFound = $true
  foreach ($method in $methodList) {
    if (-not $foundMethods.ContainsKey($method)) {
      return @{ AllFound=$false; MissingMethod=$method }
    }
  }

  # Check order
  $prevLine = -1
  foreach ($method in $methodList) {
    if ($foundMethods[$method] -lt $prevLine) {
      return @{ AllFound=$true; OrderBroken=$true; OutOfOrder=$method; File=$filePath; Label=$contextLabel }
    }
    $prevLine = $foundMethods[$method]
  }
  return @{ AllFound=$true; OrderBroken=$false }
}

# Smart JSDoc completeness checker
function Test-JsDocCompleteness($fileContent, $filePath) {
  $issues = @()
  if ($fileContent -match '@module\s+\w+') {
    if ($fileContent -notmatch '@description\s+\S') {
      $issues += "missing @description"
    }
  }
  # Check exported functions/classes for @param and @returns
  $exportedFunctions = [regex]::Matches($fileContent, 'export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)')
  foreach ($ef in $exportedFunctions) {
    $funcName = $ef.Groups[1].Value
    $params = $ef.Groups[2].Value.Trim()
    if ($params -and $params -notmatch '^\s*$') {
      # Find the JSDoc block immediately preceding this function
      $beforeFunc = $fileContent.Substring(0, $ef.Index)
      $jsdocMatch = [regex]::Match($beforeFunc, '/\*\*[\s\S]*?\*/\s*$')
      if ($jsdocMatch.Success) {
        if ($jsdocMatch.Value -notmatch '@param\s') {
          $issues += "function '$funcName' has parameters but no @param JSDoc"
        }
      } else {
        $issues += "function '$funcName' has parameters but no @param JSDoc"
      }
    }
    $retMatch = [regex]::Match($fileContent, "function\s+$funcName[\s\S]*?return\s+")
    if ($retMatch.Success -and $fileContent -notmatch "@returns?\s+") {
      # Only warn if return type is not void
      $sigMatch = [regex]::Match($fileContent, "function\s+$funcName[^\{]*\)\s*:\s*(\w+)")
      if ($sigMatch.Success -and $sigMatch.Groups[1].Value -ne 'void') {
        $issues += "function '$funcName' returns non-void but no @returns JSDoc"
      }
    }
  }
  return $issues
}

# ============================================================
# Output persistence (structured reports)
# ============================================================
$Global:CheckerOutputDir = $null
$Global:CheckerJsonOnly = $false

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

  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
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

  # Helper: generate bar chart
  function New-BarChart($value, $max, $width = 30) {
    $filled = [Math]::Max(1, [Math]::Floor($value / [Math]::Max(1, $max) * $width))
    $block = [string][char]0x2588
    $shade = [string][char]0x2591
    return ($block * $filled) + ($shade * ($width - $filled))
  }

  # Save Markdown summary (Chinese + charts)
  $mdPath = Join-Path $Global:CheckerOutputDir "checker-${timestamp}.md"

  # Compute max values for bar scaling
  $maxCatVal = 0
  foreach ($cv in $categoryStats.Values) { $m = $cv.Errors + $cv.Warnings; if ($m -gt $maxCatVal) { $maxCatVal = $m } }
  $maxRuleVal = 0
  foreach ($rc in $ruleStats.Values) { if ($rc -gt $maxRuleVal) { $maxRuleVal = $rc } }

  $totalIssues = $summary.Errors + $summary.Warnings
  $errRate = if ($totalIssues -gt 0) { [Math]::Round($summary.Errors / $totalIssues * 100) } else { 0 }
  $warnRate = 100 - $errRate

  $md = [System.Text.StringBuilder]::new()
  [void]$md.AppendLine("# Check Report - $($summary.Timestamp)")
  [void]$md.AppendLine("")
  [void]$md.AppendLine("## Summary")
  [void]$md.AppendLine("")
  [void]$md.AppendLine("| Metric | Value |")
  [void]$md.AppendLine("|--------|-------|")
  [void]$md.AppendLine("| MODs Scanned | $modCount |")
  [void]$md.AppendLine("| Total Checks | $($summary.Total) |")
  [void]$md.AppendLine("| Errors (FAIL) | $($summary.Errors) |")
  [void]$md.AppendLine("| Warnings (WARN) | $($summary.Warnings) |")
  [void]$md.AppendLine("| Passed (OK) | $($summary.Pass) |")
  [void]$md.AppendLine("")
  [void]$md.AppendLine("### Error/Warning Distribution")
  [void]$md.AppendLine("")
  [void]$md.AppendLine("``````")
  $errChart = New-BarChart $summary.Errors $totalIssues 30
  $warnChart = New-BarChart $summary.Warnings $totalIssues 30
  [void]$md.AppendLine("Errors: $errChart ${errRate}%")
  [void]$md.AppendLine("Warnings: $warnChart ${warnRate}%")
  [void]$md.AppendLine("``````")
  [void]$md.AppendLine("")

  [void]$md.AppendLine("## By Category")
  [void]$md.AppendLine("")
  [void]$md.AppendLine("| Category | Errors | Warnings | Total | Chart |")
  [void]$md.AppendLine("|------|------|------|------|--------|")
  foreach ($kv in ($categoryStats.GetEnumerator() | Sort-Object { $_.Value.Errors + $_.Value.Warnings } -Descending)) {
    $catTotal = $kv.Value.Errors + $kv.Value.Warnings
    $chart = New-BarChart $catTotal $maxCatVal 15
    [void]$md.AppendLine("| $($kv.Key) | $($kv.Value.Errors) | $($kv.Value.Warnings) | $catTotal | $chart |")
  }
  [void]$md.AppendLine("")

  [void]$md.AppendLine("## Top 20 Files with Most Issues")
  [void]$md.AppendLine("")
  [void]$md.AppendLine("| File | Errors | Warnings | Total | Chart |")
  [void]$md.AppendLine("|------|------|------|------|--------|")
  $maxFileTotal = 0
  foreach ($f in $summary.TopFiles) { $ft = $f.Errors + $f.Warnings; if ($ft -gt $maxFileTotal) { $maxFileTotal = $ft } }
  foreach ($f in $summary.TopFiles) {
    $fTotal = $f.Errors + $f.Warnings
    $chart = New-BarChart $fTotal $maxFileTotal 10
    [void]$md.AppendLine("| $($f.File) | $($f.Errors) | $($f.Warnings) | $fTotal | $chart |")
  }
  [void]$md.AppendLine("")

  [void]$md.AppendLine("## Top 20 Rules Triggered")
  [void]$md.AppendLine("")
  [void]$md.AppendLine("| Rule | Count | Chart |")
  [void]$md.AppendLine("|------|------|--------|")
  foreach ($r in $summary.TopRules) {
    $chart = New-BarChart $r.Count $maxRuleVal 20
    [void]$md.AppendLine("| $($r.Rule) | $($r.Count) | $chart |")
  }
  [void]$md.AppendLine("")

  [void]$md.AppendLine("## All Error Details")
  [void]$md.AppendLine("")
  $errorResults = @($Results | Where-Object { $_.Level -eq 'ERROR' })
  if ($errorResults.Count -eq 0) {
    [void]$md.AppendLine("> No errors")
  } else {
    foreach ($er in $errorResults) {
      $rule = $er.Rule
      $file = $er.File
      $line = $er.Line
      $msg = $er.Message
      [void]$md.AppendLine("- **[$rule]** ``$file`` L$line : $msg")
    }
  }
  [void]$md.AppendLine("")
  [void]$md.AppendLine("---")
  [void]$md.AppendLine("")
  [void]$md.AppendLine("*Report auto-generated by project-checker - $($summary.Total) total checks*")

  $md.ToString() | Set-Content -Path $mdPath -Encoding UTF8
  Write-Host "  Markdown report: $mdPath" -ForegroundColor DarkGray

  # ============================================================
  # HTML Report
  # ============================================================
  $htmlPath = Join-Path $Global:CheckerOutputDir "report.html"

  # --- Helper: group results by rule category (first letter before dash) ---
  $catGroups = @{}
  $allResults = @($Results)
  foreach ($r in $allResults) {
    $catKey = ($r.Rule -replace '-.*', '')
    if (-not $catGroups.ContainsKey($catKey)) {
      $catGroups[$catKey] = [System.Collections.ArrayList]::new()
    }
    [void]$catGroups[$catKey].Add($r)
  }

  # --- Helper: escape HTML ---
  function HtmlEncode($s) {
    if (-not $s) { return '' }
    return [System.Security.SecurityElement]::Escape($s)
  }

  # --- Build category sections ---
  $catSections = [System.Text.StringBuilder]::new()
  $catIdx = 0
  foreach ($ck in ($catGroups.Keys | Sort-Object)) {
    $catIdx++
    $grp = $catGroups[$ck]
    $grpErrors = @($grp | Where-Object { $_.Level -eq 'ERROR' }).Count
    $grpWarns  = @($grp | Where-Object { $_.Level -eq 'WARN' }).Count
    $grpTotal  = $grp.Count
    $badgeColor = if ($grpErrors -gt 0) { '#dc3545' } else { '#ffc107' }
    [void]$catSections.AppendLine("<div class='category-section'>")
    [void]$catSections.AppendLine("  <h2 class='cat-header' onclick='toggleCat(this)'>")
    [void]$catSections.AppendLine("    <span class='cat-arrow'>&#9654;</span>")
    [void]$catSections.AppendLine("    <span class='cat-label'>Category $ck</span>")
    [void]$catSections.AppendLine("    <span class='cat-badge' style='background:$badgeColor'>$grpTotal issues ($grpErrors FAIL / $grpWarns WARN)</span>")
    [void]$catSections.AppendLine("  </h2>")
    [void]$catSections.AppendLine("  <div class='cat-body' style='display:none'>")
    foreach ($item in $grp) {
      $levelClass = if ($item.Level -eq 'ERROR') { 'err' } else { 'warn' }
      $levelColor = if ($item.Level -eq 'ERROR') { '#dc3545' } else { '#ffc107' }
      $levelBg    = if ($item.Level -eq 'ERROR') { '#dc354520' } else { '#ffc10720' }
      $ruleEnc  = HtmlEncode $item.Rule
      $fileEnc  = HtmlEncode $item.File
      $lineEnc  = HtmlEncode $item.Line
      $msgEnc   = HtmlEncode $item.Message
      [void]$catSections.AppendLine("    <div class='issue-row $levelClass' style='border-left-color:$levelColor;background:$levelBg' onclick='toggleIssue(this)'>")
      [void]$catSections.AppendLine("      <div class='issue-summary'>")
      [void]$catSections.AppendLine("        <span class='issue-level' style='color:$levelColor'>[$($item.Level)]</span>")
      [void]$catSections.AppendLine("        <span class='issue-rule'>$ruleEnc</span>")
      [void]$catSections.AppendLine("        <span class='issue-file'>$fileEnc</span>")
      [void]$catSections.AppendLine("        <span class='issue-line'>$lineEnc</span>")
      [void]$catSections.AppendLine("        <span class='issue-arrow'>&#9660;</span>")
      [void]$catSections.AppendLine("      </div>")
      [void]$catSections.AppendLine("      <div class='issue-detail' style='display:none'>")
      [void]$catSections.AppendLine("        <p><strong>Message:</strong> $msgEnc</p>")
      [void]$catSections.AppendLine("        <p><strong>Rule:</strong> $ruleEnc &nbsp;|&nbsp; <strong>File:</strong> $fileEnc &nbsp;|&nbsp; <strong>Line:</strong> $lineEnc</p>")
      [void]$catSections.AppendLine("      </div>")
      [void]$catSections.AppendLine("    </div>")
    }
    [void]$catSections.AppendLine("  </div>")
    [void]$catSections.AppendLine("</div>")
  }

  $tsEnc = HtmlEncode $summary.Timestamp
  $totalEnc = $summary.Total
  $errEnc = $summary.Errors
  $warnEnc = $summary.Warnings
  $passEnc = $summary.Pass
  $modEnc = $modCount

  $html = @"
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Check Report - $tsEnc</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9;line-height:1.6;padding:24px;}
  .container{max-width:1100px;margin:0 auto;}

  header{text-align:center;padding:24px 0;border-bottom:1px solid #21262d;margin-bottom:28px;}
  header h1{font-size:1.8rem;color:#58a6ff;}
  header .ts{font-size:.85rem;color:#8b949e;margin-top:6px;}

  .summary-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-bottom:32px;}
  .card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:18px 16px;text-align:center;}
  .card .num{font-size:2rem;font-weight:700;}
  .card .label{font-size:.8rem;text-transform:uppercase;letter-spacing:.5px;margin-top:4px;color:#8b949e;}
  .card.total .num{color:#58a6ff;}
  .card.fail .num{color:#f85149;}
  .card.warn .num{color:#d2991d;}
  .card.ok .num{color:#3fb950;}

  .category-section{background:#161b22;border:1px solid #30363d;border-radius:8px;margin-bottom:12px;overflow:hidden;}
  .cat-header{cursor:pointer;padding:14px 18px;display:flex;align-items:center;gap:12px;font-size:1rem;user-select:none;transition:background .15s;}
  .cat-header:hover{background:#1c2128;}
  .cat-arrow{font-size:.75rem;transition:transform .2s;color:#8b949e;display:inline-block;width:14px;}
  .cat-arrow.open{transform:rotate(90deg);}
  .cat-label{font-weight:600;color:#e6edf3;}
  .cat-badge{font-size:.75rem;padding:3px 10px;border-radius:12px;color:#fff;font-weight:600;}
  .cat-body{padding:0 18px 14px;}

  .issue-row{border-left:4px solid;margin:6px 0;border-radius:0 6px 6px 0;cursor:pointer;overflow:hidden;transition:background .12s;}
  .issue-row:hover{filter:brightness(1.1);}
  .issue-summary{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 14px;font-size:.88rem;}
  .issue-level{font-weight:700;font-size:.8rem;min-width:48px;}
  .issue-rule{font-family:'SF Mono','Fira Code','Consolas',monospace;font-size:.82rem;color:#7ee787;min-width:140px;}
  .issue-file{font-family:'SF Mono','Fira Code','Consolas',monospace;font-size:.8rem;color:#a5d6ff;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .issue-line{font-size:.78rem;color:#8b949e;min-width:50px;}
  .issue-arrow{font-size:.7rem;color:#8b949e;transition:transform .2s;}
  .issue-arrow.open{transform:rotate(180deg);}
  .issue-detail{padding:8px 14px 14px 14px;font-size:.84rem;color:#8b949e;border-top:1px solid #21262d;}
  .issue-detail p{margin:4px 0;}
  .issue-detail strong{color:#c9d1d9;}

  .no-issues{text-align:center;padding:40px;color:#3fb950;font-size:1.1rem;}
  footer{text-align:center;padding:28px 0;font-size:.8rem;color:#484f58;border-top:1px solid #21262d;margin-top:28px;}
</style>
</head>
<body>
<div class="container">

<header>
  <h1>&#128269; Check Report</h1>
  <div class="ts">$tsEnc &mdash; $modEnc MOD(s) scanned</div>
</header>

<div class="summary-cards">
  <div class="card total"><div class="num">$totalEnc</div><div class="label">Total Checks</div></div>
  <div class="card fail"><div class="num">$errEnc</div><div class="label">FAIL</div></div>
  <div class="card warn"><div class="num">$warnEnc</div><div class="label">WARN</div></div>
  <div class="card ok"><div class="num">$passEnc</div><div class="label">OK</div></div>
</div>

$($catSections.ToString())

<footer>Auto-generated by project-checker &mdash; $tsEnc</footer>

</div>

<script>
function toggleCat(el){
  var arrow=el.querySelector('.cat-arrow');
  var body=el.nextElementSibling;
  if(body.style.display==='none'||!body.style.display){
    body.style.display='block';arrow.classList.add('open');
  }else{
    body.style.display='none';arrow.classList.remove('open');
  }
}
function toggleIssue(el){
  var detail=el.querySelector('.issue-detail');
  var arrow =el.querySelector('.issue-arrow');
  if(detail.style.display==='none'||!detail.style.display){
    detail.style.display='block';arrow.classList.add('open');
  }else{
    detail.style.display='none';arrow.classList.remove('open');
  }
}
</script>

</body>
</html>
"@

  $html | Set-Content -Path $htmlPath -Encoding UTF8
  Write-Host "     report.html" -ForegroundColor Green
}

# ============================================================
# Core reporting functions
# ============================================================

function Fail($rule, $file, $line, $msg) {
  if ($E -isnot [hashtable]) { $script:E = @{ Total=$E.Total; Errors=0; Warnings=$E.Warnings; Pass=0 } }
  if ($E -isnot [hashtable]) { $script:E = @{ Total=0; Errors=0; Warnings=0; Pass=0 } }
  $E['Errors']++
  $E['Total']++
  # Extract module name from path: src/mods/mod-foo/... -> mod-foo
  $module = ''
  if ($file -match 'src/mods/(mod-[a-z0-9-]+)') { $module = $matches[1] }
  elseif ($file -match '^(mod-[a-z0-9-]+)') { $module = $matches[1] }
  $r = [PSCustomObject]@{ Level='ERROR'; Rule=$rule; File=$file; Line=$line; Message=$msg; Module=$module }
  [void]$Results.Add($r)
  Write-Host "  [FAIL] [$rule] $file ($line) - $msg" -ForegroundColor Red
}

function Warn($rule, $file, $line, $msg) {
  if ($E -isnot [hashtable]) { $script:E = @{ Total=0; Errors=0; Warnings=0; Pass=0 } }
  $E['Warnings']++
  $E['Total']++
  # Extract module name from path: src/mods/mod-foo/... -> mod-foo
  $module = ''
  if ($file -match 'src/mods/(mod-[a-z0-9-]+)') { $module = $matches[1] }
  elseif ($file -match '^(mod-[a-z0-9-]+)') { $module = $matches[1] }
  $r = [PSCustomObject]@{ Level='WARN'; Rule=$rule; File=$file; Line=$line; Message=$msg; Module=$module }
  [void]$Results.Add($r)
  if (-not $Global:ErrorOnly) {
    Write-Host "  [WARN] [$rule] $file ($line) - $msg" -ForegroundColor Yellow
  }
}

function Pass($rule, $file, $msg) {
  if ($E -isnot [hashtable]) { $script:E = @{ Total=0; Errors=0; Warnings=0; Pass=0 } }
  $E['Pass']++
  if ($VerboseOutput) {
    Write-Host "  [OK]   [$rule] $file - $msg" -ForegroundColor Green
  }
}
