# Purpose: Persist checker results as JSON, Markdown, and HTML reports.
# Owner: quality:infrastructure
# Responsibility: Report cleanup, output configuration, and deterministic rendering only.

$Global:CheckerOutputDir = $null
$Global:CheckerJsonOnly = $false
$reportComponentsRoot = Join-Path $PSScriptRoot 'reports'
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

  Save-MarkdownCheckerReport $summary $modCount $categoryStats $ruleStats $Results $Global:CheckerOutputDir $timestamp

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
