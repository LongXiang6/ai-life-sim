/**
 * Purpose: Preserve the public local world-creation API through focused creation modules.
 * Owner: mod-world / world-init bundle.
 * Responsibility: Public exports only; local commit work remains separate.
 */

export type {
  AdditionalWorldContextOptions,
  WorldCommitResult,
  WorldContextCreationOptions,
} from './world-init-bundle/contracts'
export {
  commitWorldInitialization,
  createAdditionalWorldContext,
} from './world-init-bundle/commit'
