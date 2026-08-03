# Purpose: Detect PromptTemplate output schemas with no structural or runtime validation.
# Owner: quality:mod
# Responsibility: A7 outputSchema validation assertions only.

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

# Search the shared source snapshot for .parse( or .safeParse( calls on these schema names.
$allTsAll = $AllSrcFiles
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
