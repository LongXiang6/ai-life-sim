# Purpose: Report whether the MOD architecture policy could be loaded.
# Owner: quality:mod
# Responsibility: ARCH-RULES policy-load feedback only.

if ($Script:ArchitecturePolicyLoadError) {
  Warn 'ARCH-RULES' 'scripts/check/rules/architecture-rules.json' '' $Script:ArchitecturePolicyLoadError
}
