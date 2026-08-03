# Purpose: Validate namespaced storage-key literals owned by each MOD.
# Owner: quality:mod
# Responsibility: D5 storage owner, segment count, and category assertions only.

$validStorageCategories = @('config', 'save', 'cache', 'temp')
foreach ($modName in $ModSourceIndex.Keys) {
  foreach ($record in $ModSourceIndex[$modName].Files) {
    foreach ($key in $record.StorageKeys) {
      if ($key -match ':[a-z]+-[a-z-]+$') { continue }
      $parts = $key -split ':'
      if ($parts[0] -ne $modName -and $parts[0] -match '^mod-') {
        Warn 'D5-STORAGE-KEY' $record.RelativePath '' "          '$key'     MOD        '$($parts[0])'           MOD '$modName'          "
      }
      if ($parts.Count -lt 2 -or $parts.Count -gt 4) {
        Warn 'D5-STORAGE-KEY' $record.RelativePath '' "          '$key'                      2-4      {mod}:{category}[:{key}]   "
      }
      if ($parts.Count -ge 2 -and $parts[1] -notin $validStorageCategories) {
        Warn 'D5-STORAGE-KEY' $record.RelativePath '' "          '$key'     category '$($parts[1])'                     ${validStorageCategories}   "
      }
    }
  }
}
