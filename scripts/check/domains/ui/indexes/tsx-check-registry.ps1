# Purpose: Coordinate one cached TSX traversal for independently owned UI rule components.
# Owner: quality:ui
# Responsibility: Register TSX checks, build per-file read-only context, and invoke checks only.

$UiTsxChecks = [System.Collections.ArrayList]::new()
function Add-UiTsxCheck([scriptblock]$Check) {
  [void]$UiTsxChecks.Add($Check)
}

function Invoke-UiTsxChecks {
  foreach ($file in $AllTsxFiles) {
    $content = Get-FileContent $file.FullName
    if (-not $content) { continue }
    $context = [pscustomobject]@{
      File = $file
      FileName = $file.Name
      Content = $content
      Lines = $content -split "`n"
      RelativePath = 'src/' + $file.FullName.Substring($SrcDir.Length + 1).Replace('\', '/')
    }
    foreach ($check in $UiTsxChecks) { & $check $context }
  }
}
