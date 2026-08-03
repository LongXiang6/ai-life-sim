# Purpose: Validate exported pattern classes against the BasePattern hierarchy.
# Owner: quality:mod
# Responsibility: D25 pattern class inheritance assertions only.

foreach ($record in $PatternSourceRecords) {
  if ($record.Content -match 'export\s+class\s+\w+Pattern\b' -and
      $record.Content -notmatch 'extends\s+(BasePattern|KeywordPattern|CompoundPattern)\b') {
    Fail 'D25-PATTERN-CLASS' $record.RelativePath '' 'Pattern class must extend BasePattern, KeywordPattern, or CompoundPattern'
  }
}
