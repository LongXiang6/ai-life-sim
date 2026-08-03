# Purpose: Validate stable dotted pattern identifiers.
# Owner: quality:mod
# Responsibility: D26 pattern ID format assertions only.

foreach ($record in $PatternSourceRecords) {
  foreach ($patternId in $record.Ids) {
    if ($patternId -notmatch '^[a-z]+\.[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$') {
      Fail 'D26-PATTERN-ID' $record.RelativePath '' "Pattern ID '$patternId' should be '{category}.{name}' format"
    }
  }
}
