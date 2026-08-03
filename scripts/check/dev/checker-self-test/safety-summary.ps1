# Purpose: Validate ASCII safety and publish the checker self-test terminal result.
# Owner: quality:infrastructure
# Responsibility: Checker self-test phase 5, summary, cleanup, and exit only.

# Test 5: ASCII Safety Scan
# ============================================================
Write-SectionHeader "Test 5: ASCII Safety Scan"

foreach ($file in $allPs1Files) {
  $fileName = $file.Name
  $filePath = $file.FullName

  try {
    $rawBytes = [System.IO.File]::ReadAllBytes($filePath)
    $rawContent = [System.Text.Encoding]::UTF8.GetString($rawBytes)
  } catch {
    Write-TestResult "5-READ: $fileName" $false "Cannot read file"
    continue
  }

  # Find all non-ASCII characters and their locations
  $nonAsciiLines = @{}
  $lines = $rawContent -split "`n"
  for ($li = 0; $li -lt $lines.Count; $li++) {
    $line = $lines[$li]
    $chars = $line.ToCharArray()
    foreach ($ch in $chars) {
      if ([int]$ch -gt 127) {
        # Skip comment-only lines
        $trimmed = $line.Trim()
        if ($trimmed -match '^\s*<#|^\s*#>' -or $trimmed.StartsWith('#')) { continue }

        $snippet = if ($line.Trim().Length -gt 50) { $line.Trim().Substring(0, 50) + "..." } else { $line.Trim() }
        $nonAsciiLines[$li + 1] = $snippet
        break
      }
    }
  }

  if ($nonAsciiLines.Count -gt 0) {
    $lineList = ($nonAsciiLines.GetEnumerator() | Sort-Object Name | Select-Object -First 5 | ForEach-Object { "L$($_.Key): $($_.Value)" }) -join ' | '
    $msg = "$($nonAsciiLines.Count) line(s) with non-ASCII characters"
    if ($nonAsciiLines.Count -gt 5) { $msg += " (showing first 5)" }
    Write-TestResult "5-ASCII: $fileName" $false "$msg : $lineList"
  } else {
    Write-TestResult "5-ASCII: $fileName" $true "All ASCII-safe"
  }
}

# ============================================================
# Final Summary
# ============================================================
Write-Host ""
Write-Host "========================================================"
Write-Host "  SELF-TEST SUMMARY"
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Total tests : $TotalTests"
Write-Host "  Passed      : $PassedTests" -ForegroundColor $(if ($PassedTests -gt 0) { "Green" } else { "DarkGray" })
Write-Host "  Failed      : $FailedTests" -ForegroundColor $(if ($FailedTests -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($FailedTests -gt 0) {
  Write-Host "  RESULT: FAILED" -ForegroundColor Red
  Write-Host "  $FailedTests test(s) failed. Review issues above." -ForegroundColor Red
  exit 1
} else {
  Write-Host "  RESULT: ALL PASSED" -ForegroundColor Green
  Write-Host "  All checker scripts validated successfully." -ForegroundColor Green
  exit 0
}
