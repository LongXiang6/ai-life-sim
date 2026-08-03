# Purpose: Validate and normalize PowerShell checker script encoding.
# Owner: quality:infrastructure
# Responsibility: PowerShell byte decoding and UTF-8 conversion only.

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
