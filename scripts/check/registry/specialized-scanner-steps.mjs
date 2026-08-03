/**
 * Purpose: Declare specialized scanner nodes and their fixed process boundaries.
 * Owner: quality:check-runner
 * Responsibility: MOD, UI, structural, narrative, and scanner-contract step declarations only.
 */

import { nodeStep, powershellStep } from '../lib/runner/step-factories.mjs'

const quietPowerShell = {
  args: ['-ErrorOnly'],
  env: { CHECK_QUIET: '1' },
}

export const specializedScannerSteps = {
  standardization: [
    nodeStep('specialized-scanner-contract', 30, 'scripts/check/domains/structural/specialized-scanner-contract-smoke.mjs', {
      critical: true,
      triggers: [
        'scripts/check/domains.mjs',
        'scripts/check/registry/specialized-scanner-steps.mjs',
        'scripts/check/lib/powershell-scanner/',
        'scripts/check/domains/mod/contracts/',
        'scripts/check/domains/mod/indexes/',
        'scripts/check/domains/mod/run-',
        'scripts/check/domains/ui/contracts/',
        'scripts/check/domains/ui/indexes/',
        'scripts/check/domains/ui/run-',
        'scripts/check/domains/structural/contracts/',
        'scripts/check/domains/structural/run-',
        'scripts/check/domains/narrative/contracts/',
        'scripts/check/domains/narrative/run-',
      ],
    }),
  ],
  wiring: [
    powershellStep('mod-registration-contract', 15, 'scripts/check/domains/structural/run-mod-registration-contract.ps1', {
      ...quietPowerShell,
      critical: true,
    }),
    powershellStep('generated-mod-wiring-contract', 16, 'scripts/check/domains/structural/run-generated-mod-wiring-contract.ps1', {
      ...quietPowerShell,
      critical: true,
    }),
  ],
  mod: [
    powershellStep('mod-source-contracts', 10, 'scripts/check/domains/mod/run-source-contracts.ps1', {
      ...quietPowerShell,
      critical: true,
    }),
    nodeStep('mod-runtime-import-cycles', 20, 'scripts/check/domains/mod/runtime-import-cycle-scanner.mjs', {
      critical: true,
    }),
    powershellStep('mod-dependency-wiring-contracts', 30, 'scripts/check/domains/mod/run-dependency-wiring-contracts.ps1', quietPowerShell),
    powershellStep('mod-ownership-contracts', 40, 'scripts/check/domains/mod/run-ownership-contracts.ps1', quietPowerShell),
    powershellStep('mod-method-contracts', 50, 'scripts/check/domains/mod/run-method-contracts.ps1', quietPowerShell),
    powershellStep('mod-pattern-contracts', 60, 'scripts/check/domains/mod/run-pattern-contracts.ps1', quietPowerShell),
    powershellStep('mod-anomaly-source-contracts', 70, 'scripts/check/domains/mod/run-anomaly-source-contracts.ps1', quietPowerShell),
    powershellStep('mod-anomaly-runtime-contracts', 80, 'scripts/check/domains/mod/run-anomaly-runtime-contracts.ps1', quietPowerShell),
  ],
  ui: [
    powershellStep('ui-tsx-contracts', 10, 'scripts/check/domains/ui/run-tsx-contracts.ps1', {
      ...quietPowerShell,
      critical: true,
    }),
    powershellStep('ui-architecture-contracts', 20, 'scripts/check/domains/ui/run-architecture-contracts.ps1', {
      ...quietPowerShell,
      critical: true,
    }),
    powershellStep('ui-css-contracts', 30, 'scripts/check/domains/ui/run-css-contracts.ps1', {
      ...quietPowerShell,
      critical: true,
    }),
  ],
  narrative: [
    powershellStep('critical-method-wiring', 15, 'scripts/check/domains/narrative/run-critical-method-wiring-contract.ps1', {
      ...quietPowerShell,
      critical: true,
    }),
  ],
}
