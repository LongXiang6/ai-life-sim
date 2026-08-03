# Purpose: Detect unused output schemas and write-only store fields.
# Owner: quality:mod
# Responsibility: A7-A8 anomaly rules only.

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
        Warn "A7-SCHEMA-UNUSED" $pf "" "Zod schema '$sn' declared as outputSchema but never .parse()'d or .safeParse()'d - AI response is not validated against this schema"
      }
    }
  } else {
    foreach ($pf in $outputSchemas.Keys) {
      $sn = $outputSchemas[$pf]
      if (-not $validatedSchemas.ContainsKey($sn) -and -not $templateValidatedSchemas.ContainsKey($sn)) {
      Fail "A7-SCHEMA-UNUSED" $pf "" "Zod schema '$sn' is 1 of $unvalidatedCount output schemas never validated - AI responses are not checked against their declared schemas"
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
      Warn "A8-WRITE-ONLY" $relSt "" "Store setter '$setter' is defined but no reads found for '$fieldName' (or variants 'is${pascalField}'/'has${pascalField}') outside this store - field may be dead data"
    }
  }
}

# ============================================================
