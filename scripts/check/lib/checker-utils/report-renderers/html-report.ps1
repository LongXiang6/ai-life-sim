# Purpose: Render the interactive checker HTML report.
# Owner: quality:infrastructure
# Responsibility: HTML encoding, issue projection, and report persistence only.

function ConvertTo-CheckerHtmlText($value) {
  if (-not $value) { return '' }
  return [System.Security.SecurityElement]::Escape([string]$value)
}

function Save-HtmlCheckerReport($summary, $modCount, $results, $outputDir) {
  $htmlPath = Join-Path $outputDir 'report.html'
  $issueRows = [System.Text.StringBuilder]::new()
  foreach ($item in @($results | Sort-Object Level, Rule, File, Line)) {
    $levelClass = if ($item.Level -eq 'ERROR') { 'error' } else { 'warning' }
    $rule = ConvertTo-CheckerHtmlText $item.Rule
    $file = ConvertTo-CheckerHtmlText $item.File
    $line = ConvertTo-CheckerHtmlText $item.Line
    $message = ConvertTo-CheckerHtmlText $item.Message
    [void]$issueRows.AppendLine(@"
<tr class="$levelClass">
  <td>$($item.Level)</td>
  <td><code>$rule</code></td>
  <td><code>$file</code></td>
  <td>$line</td>
  <td>$message</td>
</tr>
"@)
  }
  if ($issueRows.Length -eq 0) {
    [void]$issueRows.AppendLine('<tr><td colspan="5" class="empty">No issues</td></tr>')
  }

  $timestamp = ConvertTo-CheckerHtmlText $summary.Timestamp
  $html = @"
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Check Report - $timestamp</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#0d1117;color:#c9d1d9;font-family:Segoe UI,system-ui,sans-serif}
  main{width:min(1180px,calc(100% - 32px));margin:24px auto 48px}
  header{display:flex;align-items:end;justify-content:space-between;gap:20px;border-bottom:1px solid #30363d;padding-bottom:16px}
  h1{margin:0;color:#e6edf3;font-size:28px}
  .meta{color:#8b949e;font-size:13px;text-align:right}
  .summary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px;margin:20px 0}
  .metric{border:1px solid #30363d;background:#161b22;padding:14px;border-radius:6px}
  .metric strong{display:block;font-size:24px;color:#e6edf3}
  .metric span{font-size:12px;color:#8b949e;text-transform:uppercase}
  .table-wrap{overflow:auto;border:1px solid #30363d;border-radius:6px}
  table{width:100%;border-collapse:collapse;background:#161b22;font-size:13px}
  th,td{padding:10px 12px;border-bottom:1px solid #30363d;text-align:left;vertical-align:top}
  th{position:sticky;top:0;background:#21262d;color:#e6edf3}
  tr.error td:first-child{color:#ff7b72;font-weight:700}
  tr.warning td:first-child{color:#d29922;font-weight:700}
  code{color:#a5d6ff;white-space:nowrap}
  .empty{text-align:center;color:#3fb950;padding:32px}
  @media(max-width:700px){.summary{grid-template-columns:repeat(2,1fr)}header{align-items:start;flex-direction:column}.meta{text-align:left}}
</style>
</head>
<body>
<main>
  <header>
    <h1>Check Report</h1>
    <div class="meta">$timestamp<br>$modCount MOD(s) scanned</div>
  </header>
  <section class="summary">
    <div class="metric"><strong>$($summary.Total)</strong><span>Total checks</span></div>
    <div class="metric"><strong>$($summary.Errors)</strong><span>Errors</span></div>
    <div class="metric"><strong>$($summary.Warnings)</strong><span>Warnings</span></div>
    <div class="metric"><strong>$($summary.Pass)</strong><span>Passed</span></div>
  </section>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Level</th><th>Rule</th><th>File</th><th>Line</th><th>Message</th></tr></thead>
      <tbody>$($issueRows.ToString())</tbody>
    </table>
  </div>
</main>
</body>
</html>
"@

  $html | Set-Content -Path $htmlPath -Encoding UTF8
  Write-Host "  HTML report: $htmlPath" -ForegroundColor DarkGray
}
