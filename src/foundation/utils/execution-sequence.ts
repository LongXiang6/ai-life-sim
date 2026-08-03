/**
 * Purpose: Preserve the public deterministic execution-sequence utility API.
 * Owner: foundation:utils
 * Responsibility: Public exports only; validation, ordering, invocation, and result handling live below execution-sequence/.
 */

export { createExecutionOutcomeCodes } from './execution-sequence/outcome-codes'
export { compareExecutionNodes, resolveExecutionOrder } from './execution-sequence/execution-order'
export { validateExecutionFlowContract } from './execution-sequence/flow-validation'
export { runExecutionSequence } from './execution-sequence/sequence-runner'
export { executionSequenceError } from './execution-sequence/result-error'
