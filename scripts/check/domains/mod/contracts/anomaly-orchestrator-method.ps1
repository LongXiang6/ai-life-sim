# Purpose: Detect registered subsystem methods that are not delegated by the orchestrator.
# Owner: quality:mod
# Responsibility: A6 missing registered class and orphaned method assertions only.

$orchPath = [System.IO.Path]::Combine($SrcDir, 'mods', 'mod-engine', 'subsystems', 'orchestrator-system.ts')
$orchContent = if (Test-Path $orchPath) { Get-ModuleResponsibilityContent $orchPath } else { '' }
# ============================================================
# A6: Orphaned subsystem methods (public but never called by orchestrator)
#     Only targets runtime subsystems registered with orchestrator (via register-subsystems.ts),
#     NOT infrastructure subsystems called directly from world-init-bundle or other bootstrap code.
# ============================================================
Write-Host "  [A6] Checking orphaned subsystem methods..." -ForegroundColor DarkGray

# JavaScript/TypeScript keywords that are NOT method names
$jsKeywords = @('if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'delete',
                'throw', 'else', 'default', 'case', 'break', 'continue', 'try', 'finally', 'do', 'in', 'of',
                'void', 'this', 'super', 'class', 'extends', 'import', 'export', 'from', 'as', 'const',
                'let', 'var', 'static', 'get', 'set', 'enum', 'interface', 'type', 'namespace', 'module',
                'implements', 'yield', 'await', 'require')

# Read register-subsystems.ts to identify which subsystems are runtime-registered
$registerPath = [System.IO.Path]::Combine($SrcDir, "mods", "mod-engine", "bootstrap", "register-subsystems.ts")
$registeredSubs = @()  # subsystem class names
if (Test-Path $registerPath) {
  $regContent = Get-FileContent $registerPath
  # Extract: new SomeSystem() pattern
  $regMatches = [regex]::Matches($regContent, 'new\s+(\w+)\s*\(')
  foreach ($rm in $regMatches) { $registeredSubs += $rm.Groups[1].Value }
}

# Read the orchestrator responsibility module to extract all delegated method calls
$orchCalls = @{}
if ($orchContent) {
  $callMatches = [regex]::Matches($orchContent, '(?:\w+\.)(\w+)\s*\(')
  foreach ($cm in $callMatches) { $orchCalls[$cm.Groups[1].Value] = $true }
}

# Only check subsystems registered with orchestrator
$subFiles = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts" -File -ErrorAction SilentlyContinue | Where-Object {
  $_.FullName -match '[\\/]subsystems[\\/]' -and $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]'
})

$orphanedMethods = @{}
foreach ($sf in $subFiles) {
  $sfc = Get-FileContent $sf.FullName
  if (-not $sfc) { continue }
  $relSF = $sf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Check if this file contains one of the registered subsystem classes
  $isRegistered = $false
  foreach ($rs in $registeredSubs) {
    if ($sfc -match "\bclass\s+$rs\b") { $isRegistered = $true; break }
  }
  if (-not $isRegistered) { continue }

  # Extract method definitions: look for lines with methodName( at start or after whitespace
  $methodMatches = [regex]::Matches($sfc, '^\s*(?:public\s+|private\s+|protected\s+|async\s+)*(\w+)\s*\(', [System.Text.RegularExpressions.RegexOptions]::Multiline)
  foreach ($mm in $methodMatches) {
    $methodName = $mm.Groups[1].Value
    if ($methodName -eq 'constructor') { continue }
    if ($methodName -match '^_') { continue }
    if ($methodName -in $jsKeywords) { continue }
    if ($methodName.Length -le 1) { continue }

    # ISubSystem interface methods are called indirectly
    if ($methodName -in @('advance', 'applyChanges', 'collectState', 'reset', 'setAIService', 'generateWithAI')) { continue }

    if (-not $orchCalls.ContainsKey($methodName)) {
      $key = "$relSF::$methodName"
      if (-not $orphanedMethods.ContainsKey($key)) {
        $orphanedMethods[$key] = @{ File = $relSF; Method = $methodName }
      }
    }
  }
}

$orphanCount = $orphanedMethods.Count
if ($orphanCount -le 2) {
  foreach ($om in $orphanedMethods.Values) {
    Warn "A6-ORPHAN-METHOD" $om.File "" "Public method '$($om.Method)()' is never called by orchestrator - may be dead code or intended for external use"
  }
} elseif ($orphanCount -gt 0) {
  $byFile = $orphanedMethods.Values | Group-Object -Property File
  foreach ($g in $byFile) {
    $methods = ($g.Group | ForEach-Object { "$($_.Method)()" }) -join ', '
    Warn "A6-ORPHAN-METHOD" $g.Name "" "Found $($g.Count) orphaned methods: $methods - none called by orchestrator (total $orphanCount across all runtime subsystems)"
  }
}

# Also check: registered subsystems whose class can't be found in any file
foreach ($rs in $registeredSubs) {
  $found = $false
  foreach ($sf in $subFiles) {
    $sfc = Get-FileContent $sf.FullName
    if ($sfc -and $sfc -match "\bclass\s+$rs\b") { $found = $true; break }
  }
  if (-not $found) {
    Fail "A6-MISSING-REG" "register-subsystems.ts" "" "Registered subsystem class '$rs' not found in any subsystem file - may be a broken reference"
  }
}
