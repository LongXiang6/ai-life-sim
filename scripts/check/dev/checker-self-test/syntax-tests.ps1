# Purpose: Validate PowerShell syntax for checker infrastructure scripts.
# Owner: quality:infrastructure
# Responsibility: Checker self-test phase 1 only.

# Test 1: PowerShell Syntax Validation
# ============================================================
Write-SectionHeader "Test 1: PowerShell Syntax Validation"

foreach ($file in $allPs1Files) {
  $fileName = $file.Name
  $filePath = $file.FullName

  # Skip self-test to avoid self-referential false positives
  if ($fileName -eq 'checker-self-test.ps1') {
    Write-Host "  [SKIP] $fileName (self-test, excluding from self-checks)" -ForegroundColor DarkGray
    continue
  }

  # Read file content
  try {
    $rawContent = [System.IO.File]::ReadAllText($filePath, [System.Text.UTF8Encoding]::new($true, $true))
  } catch {
    Write-TestResult "1-READ: $fileName" $false "Cannot read file: $_"
    continue
  }

  # --- 1a: Check for Get-Content with -Encoding UTF8 (PS 5.1 incompatible) ---
  # Check per-line to avoid cross-line false positives
  $foundGetContentUtf8 = $false
  $lineArr = $rawContent -split "`n"
  foreach ($l in $lineArr) {
    if ($l -match 'Get-Content\b.*-Encoding\s+UTF8') {
      $foundGetContentUtf8 = $true
      break
    }
  }
  if ($foundGetContentUtf8) {
    Write-TestResult "1a: $fileName - No Get-Content -Encoding UTF8" $false "Found Get-Content with -Encoding UTF8 (PS 5.1 incompatible)"
  } else {
    Write-TestResult "1a: $fileName - No Get-Content -Encoding UTF8" $true ""
  }

  # --- 1b: No non-ASCII characters in function definitions ---
  $funcDefLines = [regex]::Matches($rawContent, '^\s*function\s+([a-zA-Z_][a-zA-Z0-9_-]*)\s*', @([System.Text.RegularExpressions.RegexOptions]::Multiline))
  $badFuncNames = @()
  foreach ($m in $funcDefLines) {
    $funcName = $m.Groups[1].Value
    if ($funcName -match '[^\x00-\x7F]') {
      $badFuncNames += $funcName
    }
  }
  if ($badFuncNames.Count -gt 0) {
    Write-TestResult "1b: $fileName - ASCII function names" $false "Non-ASCII in function names: $($badFuncNames -join ', ')"
  } else {
    Write-TestResult "1b: $fileName - ASCII function names" $true ""
  }

  # --- 1c: Strings in Write-Host/Fail/Warn/Pass calls should be ASCII-safe ---
  # Look for non-ASCII in string arguments to these reporting functions
  $callPatterns = @('Write-Host\s+', 'Fail\s*\(', 'Warn\s*\(', 'Pass\s*\(')
  $nonAsciiCalls = @()
  $lines = $rawContent -split "`n"
  for ($li = 0; $li -lt $lines.Count; $li++) {
    $line = $lines[$li]
    foreach ($pat in $callPatterns) {
      if ($line -match $pat) {
        # Find single-quoted strings
        $sqMatches = [regex]::Matches($line, "'([^']*)'")
        foreach ($sm in $sqMatches) {
          $strVal = $sm.Groups[1].Value
          if ($strVal -match '[^\x00-\x7F]') {
            $shortStr = if ($strVal.Length -gt 30) { $strVal.Substring(0, 30) + "..." } else { $strVal }
            $nonAsciiCalls += "L$($li+1): '$shortStr'"
          }
        }
        # Find double-quoted strings (with escaping)
        $dqMatches = [regex]::Matches($line, '"([^"]*)"')
        foreach ($dm in $dqMatches) {
          $strVal2 = $dm.Groups[1].Value
          if ($strVal2 -match '[^\x00-\x7F]') {
            $shortStr2 = if ($strVal2.Length -gt 30) { $strVal2.Substring(0, 30) + "..." } else { $strVal2 }
            $nonAsciiCalls += "L$($li+1): `"$shortStr2`""
          }
        }
      }
    }
  }
  if ($nonAsciiCalls.Count -gt 0) {
    $sample = ($nonAsciiCalls | Select-Object -First 3) -join '; '
    $totalMsg = "$($nonAsciiCalls.Count) non-ASCII string(s) in reporting calls"
    if ($nonAsciiCalls.Count -gt 3) { $totalMsg += " (showing first 3)" }
    Write-TestResult "1c: $fileName - ASCII-safe strings" $false "$totalMsg : $sample"
  } else {
    Write-TestResult "1c: $fileName - ASCII-safe strings" $true ""
  }

  # --- 1d: Balanced braces (informational only - braces in regex/strings cause false positives) ---
  $openCount = 0
  $closeCount = 0
  for ($ci = 0; $ci -lt $rawContent.Length; $ci++) {
    $ch = $rawContent[$ci]
    if ($ch -eq '{') { $openCount++ }
    elseif ($ch -eq '}') { $closeCount++ }
  }
  $braceDiff = [Math]::Abs($openCount - $closeCount)
   if ($braceDiff -gt 0) {
     Write-Host "  [INFO] 1d: $fileName - Brace count: $openCount vs $closeCount (diff=$braceDiff)" -ForegroundColor DarkGray
   }

  # --- 1e: Parse with PowerShell AST parser (syntax errors) ---
  # Known false positives: PS 5.1 parser bug with $([char]0x...) in double-quoted strings
  $knownParserIssueFiles = @('check/domains/mod/arch-scanner.ps1')
  $parseErrors = $null
  $tokens = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseInput($rawContent, [ref]$tokens, [ref]$parseErrors)
  if ($parseErrors.Count -gt 0) {
    if ($knownParserIssueFiles -contains $fileName) {
      Write-TestResult "1e: $fileName - PowerShell parser" $true "Known parser issue ($($parseErrors.Count) parse warnings, not a script syntax error)"
    } else {
      $errMsgs = ($parseErrors | ForEach-Object { $_.Message }) -join '; '
      Write-TestResult "1e: $fileName - PowerShell parser" $false "Parse errors: $errMsgs"
    }
  } else {
    Write-TestResult "1e: $fileName - PowerShell parser" $true "No parse errors"
  }
}

# ============================================================
