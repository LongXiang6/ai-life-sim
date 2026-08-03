# Purpose: Record checker pass, warning, and failure results.
# Owner: quality:infrastructure
# Responsibility: Shared counters, structured result rows, and console projection only.

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
