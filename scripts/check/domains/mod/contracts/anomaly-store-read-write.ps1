# Purpose: Detect Zustand fields that are written but never read outside their Store.
# Owner: quality:mod
# Responsibility: A8 setter-to-field external read assertions only.

# ============================================================
# A8: Store fields written but never read
# ============================================================
Write-Host "  [A8] Checking store field read/write balance..." -ForegroundColor DarkGray

$storeFiles = @(Get-ChildItem -Path $SrcDir -Recurse -Include "store.ts" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/](node_modules|\.next)[\\/]' })

# Build member-reference ownership once. The previous implementation re-enumerated and
# regex-scanned every source file for every setter, which made A8 quadratic in project size.
$memberReferenceFiles = @{}
foreach ($sourceFile in $AllSrcFiles) {
  $sourceContent = Get-FileContent $sourceFile.FullName
  if (-not $sourceContent) { continue }
  $fileMembers = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($memberMatch in [regex]::Matches($sourceContent, '\.([A-Za-z_$][A-Za-z0-9_$]*)')) {
    [void]$fileMembers.Add($memberMatch.Groups[1].Value)
  }
  foreach ($memberName in $fileMembers) {
    if (-not $memberReferenceFiles.ContainsKey($memberName)) {
      $memberReferenceFiles[$memberName] = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::OrdinalIgnoreCase
      )
    }
    [void]$memberReferenceFiles[$memberName].Add($sourceFile.FullName)
  }
}

foreach ($stf in $storeFiles) {
  $stc = Get-FileContent $stf.FullName
  if (-not $stc) { continue }
  $relSt = $stf.FullName.Substring($SrcDir.Length + 1).Replace("\", "/")

  # Find Zustand create pattern: useXxxStore = create<State>()(set => ({ fields }))
  # We need to find setter functions (setXxx) and check if they're called outside this file
  if ($stc -notmatch "create\s*<") { continue }

  # Extract setter names from the file: setXxx: (v) => set({ xxx: v })
  # Match lowercase 'set' followed by uppercase letter (PascalCase convention)
  $setterNameMatches = [regex]::Matches($stc, '\b(set[A-Z]\w+)\s*:')
  $setterNames = @($setterNameMatches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)

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

    # Check the precomputed index for a read outside the owning store file.
    foreach ($name in $altNames) {
      if (-not $memberReferenceFiles.ContainsKey($name)) { continue }
      foreach ($referenceFile in $memberReferenceFiles[$name]) {
        if (-not [string]::Equals(
          $referenceFile,
          $stf.FullName,
          [System.StringComparison]::OrdinalIgnoreCase
        )) {
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
