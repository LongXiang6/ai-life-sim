# Purpose: Define reusable static rule metadata and local function/JSDoc inspections.
# Owner: quality:infrastructure
# Responsibility: Rule mapping and pure inspection helpers only.

$SkillRules = @{
  # File-level rules
  FileOrder = @{
    Description = "File header order: use client -> JSDoc -> react -> next -> core/foundation -> mods -> relative -> type"
    Patterns = @(
      "^(?:'use client';?)?\s*$",
      "^/\*\*[\s\S]*?\*/\s*$",
      "^import\s+.*from\s+'react'",
      "^import\s+.*from\s+'next'",
      "^import\s+.*from\s+'@/core|^import\s+.*from\s+'@/foundation",
      "^import\s+.*from\s+'@/mods/",
      "^import\s+.*from\s+'\./|^import\s+.*from\s+'\.\./",
      "^import\s+type\s+"
    )
  }

  # Class internal code order
  ClassOrder = @{
    Description = "readonly metadata -> private state -> constructor -> interface methods -> public methods -> private methods"
    OrderedSections = @(
      "readonly\s+(id|mod|label|description)\s*=",
      "private\s+\w",
      "constructor\s*\(",
      "(?:collectState|applyChanges|reset)\s*\(",
      "public\s+\w+\s*\(",
      "private\s+\w+\s*\("
    )
  }

  # Function internal logic order
  FunctionOrder = @{
    Description = "parameter validation -> core computation -> return result"
    ValidationPatterns = @("if\s*\(!|if\s*\(typeof|throw\s+new\s+Error")
    ReturnPattern = "return\s+"
  }

  # Naming convention rules
  NamingRules = @{
    ModDir     = '^mod-[a-z0-9]+(-[a-z0-9]+)*$'
    SubsystemFile = '^[a-z0-9]+(-[a-z0-9]+)*-system\.ts$'
    SubsystemClass = '^[A-Z][a-zA-Z]+System$'
    Hook       = '^use[A-Z][a-zA-Z]+$'
    Store      = '^use[A-Z][a-zA-Z]+Store$'
    Const      = '^[A-Z][A-Z0-9_]+$'
    EventName  = '^mod-[a-z-]+:[a-z]+-[a-z-]+$'
    StorageKey = '^mod-[a-z0-9-]+:(?:config|save|cache|temp):[a-z0-9-]+$'
  }

  # Critical subsystem methods that must exist in order
  SubsystemMethods = @{
    Required = @("collectState", "applyChanges", "reset")
    Order = @("collectState", "applyChanges", "reset")
  }

  # File purity rules: what each file type should contain
  FilePurity = @{
    "types.ts"      = @{ Allowed=@("interface","type","enum","import"); Forbidden=@("export const","export function","export class") }
    "constants.ts"  = @{ Allowed=@("export const [A-Z]"); Forbidden=@("export interface","export type","export enum","export function","export class") }
    "utils.ts"      = @{ Allowed=@("export function","export const"); Forbidden=@("export interface","export type","export enum","use[A-Z]") }
    "store.ts"      = @{ Allowed=@("use\w+Store","create(","devtools","persist"); Forbidden=@("export interface","export type","export enum") }
    "hooks.ts"      = @{ Allowed=@("export function use","export const use"); Forbidden=@("export interface","export type","export enum","export const [A-Z_]") }
    "manifest.ts"   = @{ Allowed=@("defineMod"); Forbidden=@("export const","export function","export interface","export type","export class") }
    "index.ts"      = @{ Allowed=@("export {"); Forbidden=@("export \*","export const","export function","export class") }
  }
}

# Smart function position checker: verifies critical methods appear in correct order
function Test-FunctionOrder($fileContent, $filePath, $methodList, $contextLabel) {
  $lines = $fileContent -split "`n"
  $foundMethods = @{}
  foreach ($method in $methodList) {
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match "^\s*(?:public\s+|private\s+|protected\s+)?${method}\s*\(") {
        $foundMethods[$method] = $i
        break
      }
    }
  }

  # Check all required methods exist
  $allFound = $true
  foreach ($method in $methodList) {
    if (-not $foundMethods.ContainsKey($method)) {
      return @{ AllFound=$false; MissingMethod=$method }
    }
  }

  # Check order
  $prevLine = -1
  foreach ($method in $methodList) {
    if ($foundMethods[$method] -lt $prevLine) {
      return @{ AllFound=$true; OrderBroken=$true; OutOfOrder=$method; File=$filePath; Label=$contextLabel }
    }
    $prevLine = $foundMethods[$method]
  }
  return @{ AllFound=$true; OrderBroken=$false }
}

# Smart JSDoc completeness checker
function Test-JsDocCompleteness($fileContent, $filePath) {
  $issues = @()
  if ($fileContent -match '@module\s+\w+') {
    if ($fileContent -notmatch '@description\s+\S') {
      $issues += "missing @description"
    }
  }
  # Check exported functions/classes for @param and @returns
  $exportedFunctions = [regex]::Matches($fileContent, 'export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)')
  foreach ($ef in $exportedFunctions) {
    $funcName = $ef.Groups[1].Value
    $params = $ef.Groups[2].Value.Trim()
    if ($params -and $params -notmatch '^\s*$') {
      # Find the JSDoc block immediately preceding this function
      $beforeFunc = $fileContent.Substring(0, $ef.Index)
      $jsdocMatch = [regex]::Match($beforeFunc, '/\*\*[\s\S]*?\*/\s*$')
      if ($jsdocMatch.Success) {
        if ($jsdocMatch.Value -notmatch '@param\s') {
          $issues += "function '$funcName' has parameters but no @param JSDoc"
        }
      } else {
        $issues += "function '$funcName' has parameters but no @param JSDoc"
      }
    }
    $retMatch = [regex]::Match($fileContent, "function\s+$funcName[\s\S]*?return\s+")
    if ($retMatch.Success -and $fileContent -notmatch "@returns?\s+") {
      # Only warn if return type is not void
      $sigMatch = [regex]::Match($fileContent, "function\s+$funcName[^\{]*\)\s*:\s*(\w+)")
      if ($sigMatch.Success -and $sigMatch.Groups[1].Value -ne 'void') {
        $issues += "function '$funcName' returns non-void but no @returns JSDoc"
      }
    }
  }
  return $issues
}

# ============================================================
# Output persistence (structured reports)
# ============================================================
