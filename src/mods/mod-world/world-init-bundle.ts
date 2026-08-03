/**
 * Purpose: Preserve the public world-init bundle API through focused creation and enrichment modules.
 * Owner: mod-world / world-init bundle.
 * Responsibility: Public exports only; commit, AI generation, and background launch remain separate.
 */

export type {
  AdditionalWorldContextOptions,
  WorldCommitResult,
  WorldContextCreationOptions,
  WorldInitBundleResult,
} from './world-init-bundle/contracts'
export {
  commitWorldInitialization,
  createAdditionalWorldContext,
} from './world-init-bundle/commit'
export { generateWorldInitBundle } from './world-init-bundle/generation'
export {
  startBackgroundWorldInit,
  startBackgroundWorldInitForCustom,
} from './world-init-bundle/background'
