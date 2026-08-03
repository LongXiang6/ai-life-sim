# Purpose: Report whether the active runtime subsystem policy could be loaded.
# Owner: quality:mod
# Responsibility: C0-RUNTIME-POLICY load feedback only.

if ($Script:RuntimeSubsystemPolicyError) {
  Fail 'C0-RUNTIME-POLICY' 'src/mods/mod-engine/helpers/mvp-stages-config.default.json' '' $Script:RuntimeSubsystemPolicyError
}
