#!/usr/bin/env node
/**
 * Purpose: Preserve the public local-check runner API across focused lifecycle components.
 * Owner: quality:infrastructure
 * Responsibility: Stable exports only; contracts, process execution, domain lifecycle, and run aggregation live below runner/.
 */

export {
  classifyStepProcessResult,
  compareCheckSteps,
  inspectUpstreamStatuses,
  validateCheckSteps,
} from './runner/contracts.mjs'
export { executeCheckGraph } from './runner/execution.mjs'
export { runDomain } from './runner/domain.mjs'
export { runCheck } from './runner/check.mjs'
