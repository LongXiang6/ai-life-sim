# Purpose: Compare UI component function exports with their source filename.
# Owner: quality:ui
# Responsibility: C16 component export naming assertions only.

Add-UiTsxCheck {
  param($file)
  $reportedName = $file.RelativePath
  if ($reportedName -notmatch '\.tsx$' -or $reportedName -match '^(page|layout|loading|error|not-found)\.tsx$') { return }
  $baseName = $reportedName -replace '\.(desktop|mobile)?\.tsx$', ''
  $baseName = $baseName -replace '\.tsx$', ''
  $expectedExport = ($baseName -split '-').ForEach({ $_.Substring(0, 1).ToUpper() + $_.Substring(1) }) -join ''
  $exportMatches = [regex]::Matches($file.Content, 'export (?:default )?function (\w+)')
  $foundMatch = $false
  foreach ($exportMatch in $exportMatches) {
    if ($exportMatch.Groups[1].Value -eq $expectedExport) { $foundMatch = $true; break }
  }
  if (-not $foundMatch -and $exportMatches.Count -gt 0) {
    $actualNames = ($exportMatches | ForEach-Object { $_.Groups[1].Value }) -join ', '
    Warn 'C16-COMPONENT-NAME' $reportedName '' "component exports '$actualNames' do not match expected '$expectedExport' from filename '$baseName'"
  }
}
