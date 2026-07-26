# anomaly-scanner.ps1
#             A1 (import file existence) | A2 (React anti-patterns) | A3 (file location) | A4 (import depth)
#             A5 (PromptCtx ↔ template vars mismatch) | A6 (orphaned subsystem methods)
#             A7 (Zod outputSchema never validated) | A8 (store write-only fields)
#             A9 (AI call missing apiKey) | A10 (lifecycle exports never wired)
#             A11 (migration file conventions) | A12 (direct localStorage in MODs)
#                              .ts/.tsx                 .tsx                      .ts/.tsx/.css          .ts/.tsx
#          checker-utils.ps1                      dot-source
#                             $modsDir, $SrcDir, $VerboseOutput

Write-Host ""
Write-Host "  Anomaly Scanner - intelligent cross-file heuristic checks" -ForegroundColor Cyan

$anomStartErrors = $E.Errors
$anomStartWarnings = $E.Warnings

# ============================================================
# A1: Suspicious import paths — imports that don't resolve to real files
# ============================================================
Write-Host "  [A1] Checking import path file existence..." -ForegroundColor DarkGray

$allModDirs = @(Get-ChildItem -Path $modsDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^mod-' })
$modDirMap = @{}
foreach ($md in $allModDirs) { $modDirMap[$md.Name] = $md.FullName }

$allSrcFilesA1 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })
$importCache = @{}

foreach ($f in $allSrcFilesA1) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Find all relative imports: from './xxx' or from '../xxx'
  $relImports = [regex]::Matches($fc, "from\s+['`"](\.\.?/[^'`"]+)['`"]")
  foreach ($m in $relImports) {
    $importPath = $m.Groups[1].Value
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count

    # Resolve relative path
    $fileDir = Split-Path $f.FullName -Parent
    try {
      $resolvedBase = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fileDir, $importPath))
    } catch { continue }

    # First check: does the exact path exist as a file? (handles explicit extensions like .module.css, .json)
    if (Test-Path -Path $resolvedBase -PathType Leaf) { continue }

    # Second check: try adding common extensions (for extensionless imports)
    $found = $false
    foreach ($ext in @('.ts', '.tsx', '.js', '.jsx', '.css', '/index.ts', '/index.tsx')) {
      if (Test-Path -Path "${resolvedBase}${ext}" -PathType Leaf) { $found = $true; break }
    }

    if (-not $found) {
      Fail "A1-IMPORT-MISSING" $relFP "L$lineNum" "Import '$importPath' resolves to a file that does not exist"
    }
  }

  # Find @/mods/... imports and verify MOD exists
  $modImports = [regex]::Matches($fc, "from\s+['`"]@/mods/(mod-[^/']+)(?:/[^'`"]*)?['`"]")
  foreach ($m in $modImports) {
    $modName = $m.Groups[1].Value
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count

    if (-not $modDirMap.ContainsKey($modName) -and $modName -ne 'mod-test') {
      Fail "A1-IMPORT-MOD" $relFP "L$lineNum" "Import from '$modName' but no MOD directory found at '$modsDir\$modName'"
    }
  }

  # === A4: Deep relative imports (merged into A1 pass) ===
  $deepImports = [regex]::Matches($fc, "from\s+['`"](\.\./(\.\./){2,}[^'`"]+)['`"]")
  foreach ($m in $deepImports) {
    $importPath = $m.Groups[1].Value
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
    Warn "A4-DEEP-IMPORT" $relFP "L$lineNum" "Deep relative import '$importPath' — consider using @/mods/ alias or restructuring"
  }
}

# ============================================================
# A2: React anti-patterns (regex-based, no AST)
# ============================================================
Write-Host "  [A2] Checking React anti-patterns..." -ForegroundColor DarkGray

$allTsxFiles = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })

foreach ($f in $allTsxFiles) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # A2a: useEffect with async callback (missing cleanup)
  $asyncEffects = [regex]::Matches($fc, 'useEffect\s*\(\s*async\s*\(')
  foreach ($m in $asyncEffects) {
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
    Warn "A2-ASYNC-EFFECT" $relFP "L$lineNum" "useEffect with async callback without cleanup — may cause memory leaks or stale state"
  }

  # A2b: useState initialized with async value
  $asyncState = [regex]::Matches($fc, 'useState\s*\(\s*await\s')
  foreach ($m in $asyncState) {
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
    Fail "A2-ASYNC-STATE" $relFP "L$lineNum" "useState initialized with await — will never resolve. Use useEffect instead."
  }

  # A2c: useEffect without dependency array (only flag single dependency, ignore empty array or explicit deps)
  $looseEffects = [regex]::Matches($fc, 'useEffect\s*\(\s*\(\s*\)\s*=>\s*\{')
  foreach ($m in $looseEffects) {
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
    # Check if there's a dep array after the callback body
    $afterCallback = $fc.Substring($m.Index)
    if ($afterCallback -match '^\s*useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*\}[^,)]*\s*\)\s*$') {
      Warn "A2-MISSING-DEPS" $relFP "L$lineNum" "useEffect has no dependency array — verify it's intentional (add [] or variable deps)"
    }
  }

  # A2d: Mutation of props
  $propMutations = [regex]::Matches($fc, '\b(prop|props|args)\s*\.\s*\w+\s*=')
  foreach ($m in $propMutations) {
    $lineNum = ($fc.Substring(0, $m.Index) -split "`n").Count
    Warn "A2-PROP-MUTATION" $relFP "L$lineNum" "Direct mutation of props/props/args detected — React props should be immutable"
  }
}

# ============================================================
# A3: File location validator
# ============================================================
Write-Host "  [A3] Checking file location conventions..." -ForegroundColor DarkGray

# A3a: _internal files outside _internal directories
Get-ChildItem -Path $SrcDir -Recurse -Include "*_internal*" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' } | ForEach-Object {
  $relFP = $_.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")
  $dirPath = (Split-Path $_.FullName -Parent).Replace("\", "/")
  if ($dirPath -notmatch '/_internal(/|$)' -and $dirPath -notmatch '/scripts/') {
    Warn "A3-INTERNAL-FILE" $relFP "" "File contains '_internal' in name but is not in _internal directory"
  }
}

# A3b: CSS module files without matching component (orphan CSS)
$allCssFilesA3 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.module.css" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })
foreach ($cssf in $allCssFilesA3) {
  $relFP = $cssf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")
  $baseName = $cssf.Name -replace '\.module\.css$', ''
  $cssDir = Split-Path $cssf.FullName -Parent
  $cssDirRel = $cssDir.Replace("\", "/")

  # Skip CSS in desktop/mobile subdirectories (architectural convention: HelpModal pattern)
  if ($cssDirRel -match '/(desktop|mobile)$') { continue }

  # Check if CSS is imported by a co-located page.tsx (Next.js App Router convention)
  $pageFile = Join-Path $cssDir "page.tsx"
  if (Test-Path $pageFile) {
    $pfc = Get-FileContent $pageFile
    if ($pfc -and $pfc -match [regex]::Escape($cssf.Name)) { continue }
  }

  # Check if a matching .tsx file exists in same directory
  $matchFound = $false
  foreach ($ext in @('.tsx', '.ts')) {
    $candidate = Join-Path $cssDir "${baseName}${ext}"
    if (Test-Path $candidate) { $matchFound = $true; break }
  }

  if (-not $matchFound) {
    Warn "A3-ORPHAN-CSS" $relFP "" "CSS module has no matching component file (${baseName}.tsx) in same directory. Consider renaming CSS or component to match."
  }
}

# A3c: .ts/.tsx files with CSS import but no matching .module.css
Get-ChildItem -Path $SrcDir -Recurse -Include "*.tsx", "*.ts" -File -ErrorAction SilentlyContinue | Where-Object {
  $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' -and
  $_.Name -notin @('manifest.ts', 'index.ts', 'store.ts', 'hooks.ts', 'constants.ts', 'utils.ts', 'types.ts', 'layout.tsx', 'page.tsx', 'route.ts')
} | ForEach-Object {
  $fc = Get-FileContent $_.FullName
  if (-not $fc) { return }
  $relFP = $_.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  $cssImport = [regex]::Match($fc, "import\s+\w+\s+from\s+['`"](\./[^'`"]+\.module\.css)['`"]")
  if ($cssImport.Success) {
    $cssRelative = $cssImport.Groups[1].Value
    $fileDir = Split-Path $_.FullName -Parent
    try {
      $cssFullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($fileDir, $cssRelative))
    } catch { return }
    if (-not (Test-Path $cssFullPath)) {
      Warn "A3-MISSING-CSS" $relFP "" "Imports '$cssRelative' but CSS module file not found"
    }
  }
}

# A4 (deep relative imports) merged into A1 file scan above — single pass over $allSrcFilesA1

$anomErrors = $E.Errors - $anomStartErrors
$anomWarnings = $E.Warnings - $anomStartWarnings

# ============================================================
# A5: PromptContext field ↔ template variable mismatch
#    Only checks the narrative prompt template (the one orchestrator calls via
#    assemblePromptContext() → buildPrompt()). Other prompts use fillPromptTemplate()
#    with direct variable objects, not PromptContext, so they are excluded.
# ============================================================
Write-Host "  [A5] Checking PromptContext fields vs narrative template variables..." -ForegroundColor DarkGray

# Read PromptContext interface to know all valid fields
$narrativeTypesPath = [System.IO.Path]::Combine($SrcDir, "foundation", "types", "narrative.types.ts")
$promptCtxFields = @()
if (Test-Path $narrativeTypesPath) {
  $ntContent = Get-FileContent $narrativeTypesPath
  if ($ntContent -match '(?s)interface PromptContext \{([^}]+)\}') {
    $ifaceBlock = $Matches[1]
    $fieldMatches = [regex]::Matches($ifaceBlock, '(\w+)\??\s*:\s*[^;,]+[,;]')
    $promptCtxFields = @($fieldMatches | ForEach-Object { $_.Groups[1].Value })
  }
}

# Read orchestrator to find which PromptContext fields are assigned
$orchPath = [System.IO.Path]::Combine($SrcDir, "mods", "mod-engine", "subsystems", "orchestrator-system.ts")
$orchAssignedFields = @()
$orchContent = ""
if (Test-Path $orchPath) {
  $orchContent = Get-FileContent $orchPath
  foreach ($f in $promptCtxFields) {
    if ([regex]::IsMatch($orchContent, "^[ \t]+$([regex]::Escape($f))[ \t]*:", [System.Text.RegularExpressions.RegexOptions]::Multiline)) {
      $orchAssignedFields += $f
    }
  }
}

# Only check the narrative prompt template (the one orchestrated by assemblePromptContext)
$narrativePromptPath = [System.IO.Path]::Combine($SrcDir, "mods", "mod-engine", "prompts", "narrative-prompt.ts")
$narrativeTemplateVars = @()
if (Test-Path $narrativePromptPath) {
  $npContent = Get-FileContent $narrativePromptPath
  if ($npContent -match "variables\s*:\s*\[([^\]]+)\]") {
    $varBlock = $Matches[1]
    $varMatches = [regex]::Matches($varBlock, "'(\w+)'")
    $narrativeTemplateVars = @($varMatches | ForEach-Object { $_.Groups[1].Value })
  }
}

# The narrative template does NOT use variables[]/{{placeholder}} at runtime: buildPrompt() routes
# name==='narrative' to buildNarrativeUserJson(context) in prompt-builder.ts, which maps each
# context.<field> to a Chinese JSON key. So a field also reaches the AI if it is consumed there —
# checking variables[] alone falsely flags fields injected only via buildNarrativeUserJson.
$promptBuilderPath = [System.IO.Path]::Combine($SrcDir, "core", "ai-service", "prompt-builder.ts")
$promptBuilderCtxFields = @()
if (Test-Path $promptBuilderPath) {
  $pbContent = Get-FileContent $promptBuilderPath
  $pbMatches = [regex]::Matches($pbContent, "context\.(\w+)")
  $promptBuilderCtxFields = @($pbMatches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
}

# Check A: PromptContext field assigned by orchestrator but reaching the AI through NEITHER the
# narrative template variables[] NOR buildNarrativeUserJson(context.<field>) → truly never reaches AI
foreach ($f in $orchAssignedFields) {
  if (($f -notin $narrativeTemplateVars) -and ($f -notin $promptBuilderCtxFields)) {
    Fail "A5-CTX-ORPHAN" "orchestrator-system.ts" "" "PromptContext field '$f' is assigned in assemblePromptContext() but neither narrative template variables[] nor buildNarrativeUserJson consume it — data computed every round but never reaches the AI"
  }
}

# Check B: narrative template variables that are NOT in PromptContext interface
foreach ($v in $narrativeTemplateVars) {
  if ($v -notin $promptCtxFields) {
    Fail "A5-VAR-MISSING" "mods/mod-engine/prompts/narrative-prompt.ts" "" "Template variable '{{$v}}' is in variables[] but '$v' does not exist in PromptContext interface — will always resolve to empty string in narrative prompt"
  }
}

# A5b: summary-prompt template variables must appear in userPromptTemplate
$summaryPromptPath = [System.IO.Path]::Combine($SrcDir, "mods", "mod-engine", "prompts", "summary-prompt.ts")
if (Test-Path $summaryPromptPath) {
  $spContent = Get-FileContent $summaryPromptPath
  if ($spContent -match "variables\s*:\s*\[([^\]]+)\]") {
    $spVarBlock = $Matches[1]
    $spVars = @([regex]::Matches($spVarBlock, "'(\w+)'") | ForEach-Object { $_.Groups[1].Value })
    foreach ($sv in $spVars) {
      if ($spContent -notmatch "\{\{$([regex]::Escape($sv))\}\}") {
        Fail "A5-SUMMARY-VAR" "mods/mod-engine/prompts/summary-prompt.ts" "" "summaryPrompt variables[] declares '$sv' but userPromptTemplate has no {{$sv}}"
      }
    }
  }
}

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

# Read orchestrator to extract all method calls
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
    Warn "A6-ORPHAN-METHOD" $om.File "" "Public method '$($om.Method)()' is never called by orchestrator — may be dead code or intended for external use"
  }
} elseif ($orphanCount -gt 0) {
  $byFile = $orphanedMethods.Values | Group-Object -Property File
  foreach ($g in $byFile) {
    $methods = ($g.Group | ForEach-Object { "$($_.Method)()" }) -join ', '
    Warn "A6-ORPHAN-METHOD" $g.Name "" "Found $($g.Count) orphaned methods: $methods — none called by orchestrator (total $orphanCount across all runtime subsystems)"
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
    Fail "A6-MISSING-REG" "register-subsystems.ts" "" "Registered subsystem class '$rs' not found in any subsystem file — may be a broken reference"
  }
}

# ============================================================
# A7: Zod outputSchema declared but never validated
# ============================================================
Write-Host "  [A7] Checking unused Zod outputSchema declarations..." -ForegroundColor DarkGray

# Collect all prompt files (used by A7 only)
$allPromptFiles = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match '[\\/]prompts[\\/]' -and $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })

# Collect all outputSchema variable names from prompt files
$outputSchemas = @{}
foreach ($pf in $allPromptFiles) {
  $pfc = Get-FileContent $pf.FullName
  if (-not $pfc) { continue }
  $relPF = $pf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Pattern: outputSchema: SchemaName (in a PromptTemplate object)
  if ($pfc -match 'outputSchema\s*:\s*(\w+)') {
    $schemaName = $Matches[1]
    if ($schemaName -ne 'z' -and $schemaName -notmatch '^z\.') {
      $outputSchemas[$relPF] = $schemaName
    }
  }
}

# Check if schema is referenced in the same file's PromptTemplate definition
# (e.g. export const xxxPrompt: PromptTemplate = { ..., outputSchema, ... })
# These schemas ARE used structurally — they define the AI output contract even
# if not explicitly .parse()'d at every call site.
$templateValidatedSchemas = @{}
foreach ($pf in $allPromptFiles) {
  $pfc = Get-FileContent $pf.FullName
  if (-not $pfc) { continue }
  $relPF = $pf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")
  if (-not $outputSchemas.ContainsKey($relPF)) { continue }
  $sn = $outputSchemas[$relPF]

  # Heuristic: if the file defines a PromptTemplate (has ': PromptTemplate' or 'PromptTemplate =')
  # AND contains the schema name somewhere after that, the schema is structurally used.
  if ($pfc -match ': PromptTemplate\b') {
    # Check if $sn appears in the file content (anywhere after PromptTemplate context)
    if ($pfc -match "\b$sn\b") {
      # Verify the schema is used as a value (not just as a definition)
      # Pattern: outputSchema: $sn  or  , outputSchema  (shorthand) or  outputSchema,  or  outputSchema }
      if ($pfc -match "outputSchema\s*:\s*$sn\b" -or
          $pfc -match ",\s*outputSchema\s*[,}]" -or
          $pfc -match "\{\s*outputSchema\s*[,}]") {
        $templateValidatedSchemas[$sn] = $true
      }
    }
  }
}

# Search all .ts files for .parse( or .safeParse( calls on these schema names
$allTsAll = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts", "*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })
$validatedSchemas = @{}
foreach ($tsf in $allTsAll) {
  $tsc = Get-FileContent $tsf.FullName
  if (-not $tsc) { continue }
  foreach ($sn in $outputSchemas.Values) {
    if ($tsc -match [regex]::Escape("${sn}.parse(") -or $tsc -match [regex]::Escape("${sn}.safeParse(")) {
      $validatedSchemas[$sn] = $true
    }
  }
}

$unvalidatedCount = 0
foreach ($pf in $outputSchemas.Keys) {
  $sn = $outputSchemas[$pf]
  if (-not $validatedSchemas.ContainsKey($sn) -and -not $templateValidatedSchemas.ContainsKey($sn)) {
    $unvalidatedCount++
  }
}

if ($unvalidatedCount -gt 0) {
  # Frequency heuristic: 1-2 files = WARN (may be intentional), 3+ = FAIL
  if ($unvalidatedCount -le 2) {
    foreach ($pf in $outputSchemas.Keys) {
      $sn = $outputSchemas[$pf]
      if (-not $validatedSchemas.ContainsKey($sn) -and -not $templateValidatedSchemas.ContainsKey($sn)) {
        Warn "A7-SCHEMA-UNUSED" $pf "" "Zod schema '$sn' declared as outputSchema but never .parse()'d or .safeParse()'d — AI response is not validated against this schema"
      }
    }
  } else {
    foreach ($pf in $outputSchemas.Keys) {
      $sn = $outputSchemas[$pf]
      if (-not $validatedSchemas.ContainsKey($sn) -and -not $templateValidatedSchemas.ContainsKey($sn)) {
        Fail "A7-SCHEMA-UNUSED" $pf "" "Zod schema '$sn' is 1 of $unvalidatedCount output schemas never validated — AI responses are not checked against their declared schemas"
      }
    }
  }
}

# ============================================================
# A8: Store fields written but never read
# ============================================================
Write-Host "  [A8] Checking store field read/write balance..." -ForegroundColor DarkGray

$storeFiles = @(Get-ChildItem -Path $SrcDir -Recurse -Include "store.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })

foreach ($stf in $storeFiles) {
  $stc = Get-FileContent $stf.FullName
  if (-not $stc) { continue }
  $relSt = $stf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Find Zustand create pattern: useXxxStore = create<State>()(set => ({ fields }))
  # We need to find setter functions (setXxx) and check if they're called outside this file
  if ($stc -notmatch "create\s*<") { continue }

  # Extract state field names from the store interface/type
  $stateFields = @()
  if ($stc -match '(?s)interface\s+\w+State\s*\{([^}]+)\}') {
    $sfBlock = $Matches[1]
    $sfMatches = [regex]::Matches($sfBlock, '(\w+)\??\s*:')
    $stateFields = @($sfMatches | ForEach-Object { $_.Groups[1].Value })
  } elseif ($stc -match '(?s)create\s*<\s*\{([^}]+)\}\s*>') {
    $sfBlock = $Matches[1]
    $sfMatches = [regex]::Matches($sfBlock, '(\w+)\??\s*:')
    $stateFields = @($sfMatches | ForEach-Object { $_.Groups[1].Value })
  }

  # Extract setter names from the file: setXxx: (v) => set({ xxx: v })
  # Match lowercase 'set' followed by uppercase letter (PascalCase convention)
  $setterNameMatches = [regex]::Matches($stc, '\b(set[A-Z]\w+)\s*:')
  $setterNames = @($setterNameMatches | ForEach-Object { $_.Groups[1].Value } )

  # Search ALL source files for field reads (store fields can be read across MODs)
  $searchDirs = @($SrcDir)

  foreach ($setter in $setterNames) {
    $fieldName = $setter -creplace '^set', ''
    # Convert PascalCase setter back to camelCase field: setCurrentYear → currentYear
    if ($fieldName.Length -gt 0) {
      $fieldName = $fieldName.Substring(0, 1).ToLower() + $fieldName.Substring(1)
    }
    # Also derive common naming variants: setDragging → isDragging, hasDragging
    $pascalField = $fieldName.Substring(0, 1).ToUpper() + $fieldName.Substring(1)
    $altNames = @($fieldName, "is${pascalField}", "has${pascalField}")
    $foundRead = $false

    # Check if the field is read outside the store file
    $allTsInScope = @(Get-ChildItem -Path $searchDirs -Recurse -Include "*.ts", "*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notin @($stf.FullName) -and $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })
    foreach ($scopeF in $allTsInScope) {
      $scopeC = Get-FileContent $scopeF.FullName
      if (-not $scopeC) { continue }
      # Check all naming variants
      foreach ($name in $altNames) {
        if ($scopeC -match [regex]::Escape(".$name") -or $scopeC -match [regex]::Escape(".${name}")) {
          $foundRead = $true
          break
        }
      }
      if ($foundRead) { break }
    }
    if (-not $foundRead) {
      Warn "A8-WRITE-ONLY" $relSt "" "Store setter '$setter' is defined but no reads found for '$fieldName' (or variants 'is${pascalField}'/'has${pascalField}') outside this store — field may be dead data"
    }
  }
}

# ============================================================
# A9: AI call sites missing apiKey option
#    Detects callAI/callAIStream/callAIStreamDegraded/callAIDegraded
#    calls that don't pass apiKey in the options parameter.
#    Without apiKey, user-entered custom API key (from Settings)
#    never reaches /api/proxy → always 500 "API Key 未配置".
#
#    NOTE: Skips this.callAI(pattern) — these use injected AI service
#    via setAIService(), where apiKey is passed at the injection site
#    (e.g. world-init-bundle.ts's createAIService).
#
#    Spread-forwarding aware: apiKey counts as present when the options
#    argument spreads (or is) a variable that forwards apiKey, e.g.
#      const streamOpts = { ..., apiKey: customKey }; callAIDegraded(m, fb, streamOpts)
#      const { ...restOptions } = options; const commonOpts = { ...restOptions }; callAI(s, u, commonOpts)
#    Such "carrier" identifiers are traced per file so thin wrappers /
#    pre-built option objects are not falsely flagged.
# ============================================================
Write-Host "  [A9] Checking AI call sites for missing apiKey..." -ForegroundColor DarkGray

$aiCallFuncs = @('callAI', 'callAIStream', 'callAIStreamDegraded', 'callAIDegraded')
$allSrcFilesA9 = @(Get-ChildItem -Path $SrcDir -Recurse -Include "*.ts","*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next|ai-client\.ts)$' })

foreach ($f in $allSrcFilesA9) {
  $fc = Get-FileContent $f.FullName
  if (-not $fc) { continue }
  $relFP = $f.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Skip files that use injected AI service via setAIService()
  # (apiKey is passed at injection site, not inside the subsystem)
  if ($fc -match 'setAIService\s*\(') { continue }

  $lines = $fc -split "`n"

  # --- Build set of identifiers that forward apiKey (spread-forwarding detection) ---
  # A variable "carries" apiKey if:
  #   (1) it is a rest capture from object destructuring: const { a, ...rest } = opts  → rest
  #   (2) it is assigned an object literal that contains a literal `apiKey` field
  #   (3) it is assigned an object literal that spreads another carrier: { ...carrier }
  #   (4) it is aliased directly from another carrier: const x = carrier
  # Passes repeat to resolve transitive (3)/(4) chains.
  $carriers = New-Object System.Collections.Generic.HashSet[string]

  # Rule (1): rest captures from object destructuring
  foreach ($m in [regex]::Matches($fc, '\.\.\.(\w+)\s*\}\s*=')) {
    [void]$carriers.Add($m.Groups[1].Value)
  }

  # Collect variable assignments: object literals (with body text) and direct aliases
  $assignments = @()
  for ($si = 0; $si -lt $lines.Count; $si++) {
    if ($lines[$si] -match '(?:const|let|var)\s+(\w+)\s*=\s*\{') {
      $name = $Matches[1]
      $depth = 0
      $started = $false
      $body = ''
      for ($sj = $si; $sj -lt $lines.Count; $sj++) {
        $t = $lines[$sj]
        $body += $t + "`n"
        $opens = ([regex]::Matches($t, '\{')).Count
        $closes = ([regex]::Matches($t, '\}')).Count
        $depth += $opens - $closes
        if ($opens -gt 0) { $started = $true }
        if ($started -and $depth -le 0) { break }
      }
      $assignments += @{ Name = $name; Body = $body }
    }
    elseif ($lines[$si] -match '(?:const|let|var)\s+(\w+)\s*=\s*(\w+)\s*;?\s*$') {
      $assignments += @{ Name = $Matches[1]; Alias = $Matches[2] }
    }
  }

  # Transitive resolution (rules 2/3/4)
  for ($pass = 0; $pass -lt 4; $pass++) {
    $changed = $false
    foreach ($a in $assignments) {
      if ($carriers.Contains($a.Name)) { continue }
      $isCarrier = $false
      if ($a.ContainsKey('Alias')) {
        if ($carriers.Contains($a.Alias)) { $isCarrier = $true }
      }
      else {
        $b = $a.Body
        if ($b -match '\bapiKey\b') { $isCarrier = $true }
        else {
          foreach ($sp in [regex]::Matches($b, '\.\.\.(\w+)')) {
            if ($carriers.Contains($sp.Groups[1].Value)) { $isCarrier = $true; break }
          }
        }
      }
      if ($isCarrier) { [void]$carriers.Add($a.Name); $changed = $true }
    }
    if (-not $changed) { break }
  }

  for ($li = 0; $li -lt $lines.Count; $li++) {
    $line = $lines[$li]
    # Skip this.callAI() — injected AI service, apiKey handled at injection site
    if ($line -match 'this\.(callAI|callAIStream)') { continue }
    # Match: callAI(..., or callAIStream(..., etc.
    if ($line -notmatch '(callAI|callAIStream|callAIStreamDegraded|callAIDegraded)\s*\(') { continue }
    $callName = $Matches[1]

    # Build the call's argument region, bounded by paren depth (max 20 lines)
    $cm = [regex]::Match($line, "$([regex]::Escape($callName))\s*\(")
    $segment = if ($cm.Success) { $line.Substring($cm.Index) } else { $line }
    $regionText = $segment
    $foundApiKey = ($segment -match '\bapiKey\b')
    $depth = ([regex]::Matches($segment, '\(')).Count - ([regex]::Matches($segment, '\)')).Count
    $closed = ($depth -le 0)

    $lookAhead = [Math]::Min($li + 20, $lines.Count - 1)
    for ($lj = $li + 1; (-not $closed) -and $lj -le $lookAhead; $lj++) {
      $nextLine = $lines[$lj]
      $regionText += "`n" + $nextLine
      if ($nextLine -match '\bapiKey\b') { $foundApiKey = $true }
      $depth += ([regex]::Matches($nextLine, '\(')).Count - ([regex]::Matches($nextLine, '\)')).Count
      if ($depth -le 0) { $closed = $true }
    }

    # Spread-forwarding: options region spreads a known apiKey carrier
    if (-not $foundApiKey) {
      foreach ($sp in [regex]::Matches($regionText, '\.\.\.(\w+)')) {
        if ($carriers.Contains($sp.Groups[1].Value)) { $foundApiKey = $true; break }
      }
    }
    # Bare-identifier options arg that is a known carrier (e.g. callAIDegraded(msgs, fb, streamOpts))
    if (-not $foundApiKey) {
      foreach ($c in $carriers) {
        if ($regionText -match "\b$([regex]::Escape($c))\b") { $foundApiKey = $true; break }
      }
    }

    if (-not $foundApiKey) {
      Fail "A9-MISSING-APIKEY" $relFP "L$($li+1)" "$callName() called without apiKey option — user's custom API key will never reach /api/proxy, always 500"
    }
  }
}

$anom2Errors = $E.Errors - $anomStartErrors - $anomErrors
$anom2Warnings = $E.Warnings - $anomStartWarnings - $anomWarnings

# ============================================================
# A10: Exported lifecycle functions never called in loading flow
#      Detects functions exported from core/mod-loader/, core/store-migration/,
#      core/instrument/ that should be wired into the app loading chain
#      (init-mods.tsx or internal callers in the loading modules)
# ============================================================
Write-Host "  [A10] Checking lifecycle exports for wiring gaps..." -ForegroundColor DarkGray

$a10StartErrors = $E.Errors
$a10StartWarnings = $E.Warnings

# Loading chain files — functions should appear in at least one of these
$loadingChainPaths = @(
  Join-Path $SrcDir "app\_components\init-mods.tsx"
  Join-Path $SrcDir "app\_components\init-mods-routes.ts"
  Join-Path $SrcDir "app\_components\init-mods-bootstrap.ts"
  Join-Path $SrcDir "core\mod-loader\mod-loader.ts"
  Join-Path $SrcDir "core\mod-loader\mod-lifecycle.ts"
  Join-Path $SrcDir "core\mod-loader\mod-validator.ts"
  Join-Path $SrcDir "core\mod-loader\dependency-resolver.ts"
  Join-Path $SrcDir "core\mod-loader\mod-registry.ts"
  Join-Path $SrcDir "core\mod-loader\settings-stage.ts"
)

$loadingChainFiles = @(foreach ($p in $loadingChainPaths) { if (Test-Path $p) { $p } })

# Preload loading chain content
$loadingChainContent = @()
foreach ($p in $loadingChainFiles) {
  $c = Get-FileContent $p
  if ($c) { $loadingChainContent += $c }
}
$loadingChainAll = $loadingChainContent -join "`n"

# Preload all core/foundation .ts files for cross-directory caller search
# (e.g., isLikelyRemoteApiExport in core/mod-loader/ called by core/remote-interface/)
$coreAndFoundationPaths = @(Get-ChildItem -Path "$SrcDir\core", "$SrcDir\foundation" -Recurse -Include "*.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'index.ts' -and $_.Name -notmatch '\.generated\.ts$' })
$coreAndFoundationContent = @{}
foreach ($fp in $coreAndFoundationPaths) {
  $c = Get-FileContent $fp.FullName
  if ($c) { $coreAndFoundationContent[$fp.FullName] = $c }
}

# Scan directories for exported functions
$checkedDirs = @(
  "$SrcDir\core\mod-loader"
  "$SrcDir\core\store-migration"
  "$SrcDir\core\instrument"
)

# Known false positives — dev tools, runtime-only APIs, or lower-level utilities
# not meant to be directly wired into the loading flow
$knownDevTools = @(
  'enableInstrumentMode', 'disableInstrumentMode', 'defineMod', 'ENGINE_FEATURE_FLAGS',
  # autoMigrate is the lower-level explicit-chain API; autoMigrateFromDir is the wired entry point
  'autoMigrate',
  'reportRemoteContractIssues'
)

$checkedFiles = @(Get-ChildItem -Path $checkedDirs -Recurse -Include "*.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'index.ts' })

foreach ($cf in $checkedFiles) {
  if ($cf.Name -match '\.generated\.ts$') { continue }
  $cfContent = Get-FileContent $cf.FullName
  if (-not $cfContent) { continue }
  $relFP = $cf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Extract: export function FUNC | export async function FUNC | export const FUNC =
  $funcMatches = [regex]::Matches($cfContent, 'export\s+(?:async\s+)?(?:function|const)\s+(\w+)')
  foreach ($fm in $funcMatches) {
    $funcName = $fm.Groups[1].Value
    if ($funcName -in $knownDevTools) { continue }
    # Skip type-only exports and constants that start with lowercase
    if ($funcName -cmatch '^[a-z]' -and $cfContent -notmatch "export\s+(?:async\s+)?function\s+$funcName\b") { continue }
    # Skip interfaces and types (const with : that is type)
    if ($cfContent -match "const\s+$funcName\s*:\s*\w+\[\]") { continue }
    
    # Check if called in loading chain (as FUNC( pattern)
    if ($loadingChainAll -match "\b$funcName\s*\(") { continue }

    # Also check within the same directory (internal callers, e.g. parseDependency called by resolveDependenciesV2)
    $sameDirFiles = @(Get-ChildItem -Path (Split-Path $cf.FullName -Parent) -Include "*.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -ne $cf.FullName })
    $foundInternal = $false
    foreach ($sdf in $sameDirFiles) {
      $sdfContent = Get-FileContent $sdf.FullName
      if ($sdfContent -and $sdfContent -match "\b$funcName\s*\(") {
        $foundInternal = $true
        break
      }
    }
    if ($foundInternal) { continue }

    # Check in orchestrator (for instrument hooks)
    $orchPath = Join-Path $SrcDir "mods\mod-engine\subsystems\orchestrator-system.ts"
    if (Test-Path $orchPath) {
      $orchC = Get-FileContent $orchPath
      if ($orchC -and $orchC -match "\b$funcName\s*\(") { continue }
    }

    # Check in all core/foundation files outside the current directory
    # (e.g., remote-api-filter.ts called by remote-interface.ts)
    $foundCrossDir = $false
    foreach ($fp2 in $coreAndFoundationPaths) {
      if ($fp2.FullName -eq $cf.FullName) { continue }
      # Skip same-directory files (already checked above)
      if ((Split-Path $fp2.FullName -Parent) -eq (Split-Path $cf.FullName -Parent)) { continue }
      $fpContent = $coreAndFoundationContent[$fp2.FullName]
      if ($fpContent -and $fpContent -match "\b$funcName\s*\(") {
        $foundCrossDir = $true
        break
      }
    }
    if ($foundCrossDir) { continue }

    Fail "A10-UNWIRED-EXPORT" $relFP "" "Exported function '$funcName()' is defined but never called in loading flow, same MOD, core/, foundation/, or orchestrator. May be dead code or missing wiring."
  }
}

$a10Errors = $E.Errors - $a10StartErrors
$a10Warnings = $E.Warnings - $a10StartWarnings

# ============================================================
# A11: Migration file naming convention
#      Checks migrations/*.ts files follow {x.y.z}-{x.y.z}.ts
#      and export a `migrate` function.
#      Absorbs Factorio migrations/ directory convention.
# ============================================================
Write-Host "  [A11] Checking migration file conventions..." -ForegroundColor DarkGray

$a11StartErrors = $E.Errors
$a11StartWarnings = $E.Warnings

$allModDirsA11 = @(Get-ChildItem -Path $modsDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^mod-' })
foreach ($md in $allModDirsA11) {
  $migDir = Join-Path $md.FullName "migrations"
  if (-not (Test-Path $migDir)) { continue }
  $migFiles = @(Get-ChildItem -Path $migDir -Filter "*.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'index.ts' })
  foreach ($mf in $migFiles) {
    $mfContent = Get-FileContent $mf.FullName
    $relFP = $mf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")
    $baseName = $mf.Name -replace '\.ts$', ''

    # Check naming: {semver}-{semver}.ts e.g. 1.0.0-1.0.1.ts
    if ($baseName -notmatch '^\d+\.\d+\.\d+-\d+\.\d+\.\d+$') {
      Fail "A11-MIGRATION-NAME" $relFP "" "Migration file name must be '{fromVersion}-{toVersion}.ts' (semver to semver). Found: '$($mf.Name)'"
    }

    # Check exports `migrate` function (as named or default)
    if ($mfContent -and $mfContent -notmatch 'export\s+(?:async\s+)?function\s+migrate\b' -and $mfContent -notmatch 'migrate\s*:') {
      Fail "A11-MIGRATION-EXPORT" $relFP "" "Migration file must export a 'migrate' function. Found no export matching that pattern."
    }
  }
}

$a11Errors = $E.Errors - $a11StartErrors
$a11Warnings = $E.Warnings - $a11StartWarnings

# ============================================================
# A12: Direct localStorage usage in MOD code
#      MODs should use context.getStorage() for per-MOD namespace
#      isolation instead of raw localStorage access.
#      Absorbs Factorio per-MOD storage isolation design.
# ============================================================
Write-Host "  [A12] Checking for direct localStorage in MODs..." -ForegroundColor DarkGray

$a12StartErrors = $E.Errors
$a12StartWarnings = $E.Warnings

# Only check files under mods/, exclude core/ and foundation/
$modFilesA12 = @(Get-ChildItem -Path $modsDir -Recurse -Include "*.ts", "*.tsx" -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -notin @('index.ts', 'manifest.ts') })

# Files intentionally using localStorage (justified exceptions):
#   DisclaimerModal.tsx — reads disclaimer acceptance flag at earliest boot time,
#     before any store initialization. Lightweight boolean, no namespacing needed.
$A12_EXCLUSIONS = @(
  'mods/mod-ui/components/organisms/DisclaimerModal.tsx'
)

foreach ($mf in $modFilesA12) {
  $mfc = Get-FileContent $mf.FullName
  if (-not $mfc) { continue }
  $relFP = $mf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Skip justified exclusions
  if ($A12_EXCLUSIONS -contains $relFP) { continue }

  # Check for raw localStorage usage
  if ($mfc -match 'localStorage\.(getItem|setItem|removeItem|clear)\s*\(') {
    $lineNum = ($mfc.Substring(0, ($mfc | Select-String 'localStorage\.(?:getItem|setItem|removeItem|clear)\s*\(' | Select-Object -First 1).Matches[0].Index) -split "`n").Count
    Warn "A12-STORAGE-LEAK" $relFP "L$lineNum" "Direct localStorage access detected. Use context.getStorage() for per-MOD namespace isolation instead."
  }
}

$a12Errors = $E.Errors - $a12StartErrors
$a12Warnings = $E.Warnings - $a12StartWarnings

$totalErrors = $anomErrors + $anom2Errors + $a10Errors + $a11Errors + $a12Errors
$totalWarnings = $anomWarnings + $anom2Warnings + $a10Warnings + $a11Warnings + $a12Warnings
Write-Host "                   : A1-A4=$anomErrors err, $anomWarnings warn | A5-A12=$($anom2Errors + $a10Errors + $a11Errors + $a12Errors) err, $($anom2Warnings + $a10Warnings + $a11Warnings + $a12Warnings) warn" -ForegroundColor $(if ($totalErrors -gt 0) { "Red" } elseif ($totalWarnings -gt 0) { "Yellow" } else { "Green" })
