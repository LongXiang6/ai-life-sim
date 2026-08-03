# Purpose: Validate the category segment of each pattern identifier.
# Owner: quality:mod
# Responsibility: D27 pattern category whitelist assertions only.

$validPatternCategories = @('relationship', 'importance', 'closure', 'forgetting', 'direction')
foreach ($record in $PatternSourceRecords) {
  foreach ($patternId in $record.Ids) {
    $category = $patternId.Split('.')[0]
    if ($category -notin $validPatternCategories) {
      Fail 'D27-PATTERN-CATEGORY' $record.RelativePath '' "Pattern category '$category' not in whitelist: $($validPatternCategories -join ', ')"
    }
  }
}
