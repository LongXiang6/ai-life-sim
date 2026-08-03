# Purpose: Cache source text and traverse files once for local checker rules.
# Owner: quality:infrastructure
# Responsibility: File reads, preload state, cache reset, and unified traversal only.

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

function Get-ModuleResponsibilityContent($entryPath) {
  $moduleFiles = @()
  if (Test-Path $entryPath -PathType Leaf) {
    $moduleFiles += Get-Item -LiteralPath $entryPath
  }

  $extension = [System.IO.Path]::GetExtension($entryPath)
  $responsibilityDirectory = if ($extension) {
    $entryPath.Substring(0, $entryPath.Length - $extension.Length)
  } else {
    $entryPath
  }
  if (Test-Path $responsibilityDirectory -PathType Container) {
    $moduleFiles += Get-ChildItem -LiteralPath $responsibilityDirectory -Recurse -File |
      Where-Object { $_.Extension -in @('.cjs', '.css', '.js', '.jsx', '.mjs', '.ts', '.tsx') } |
      Sort-Object FullName
  }

  return ($moduleFiles | ForEach-Object { Get-FileContent $_.FullName } | Where-Object { $_ }) -join "`n"
}

function Get-DeclaredStringArray($content, $fieldName) {
  if (-not $content -or -not $fieldName) { return @() }
  $escapedField = [regex]::Escape($fieldName)
  $match = [regex]::Match($content, "${escapedField}:\s*\[([\s\S]*?)\]")
  if (-not $match.Success) { return @() }

  $values = @(
    [regex]::Matches($match.Groups[1].Value, '[''"]([^''"]+)[''"]') |
      ForEach-Object { $_.Groups[1].Value.Trim() } |
      Where-Object { $_ }
  )
  return $values
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
