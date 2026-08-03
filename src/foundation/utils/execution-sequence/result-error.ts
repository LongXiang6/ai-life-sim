/**
 * Purpose: Convert a terminal execution result into the enriched Error consumed by callers.
 * Owner: foundation:utils
 * Responsibility: Failure-result error projection only.
 */

import type { ExecutionSequenceResult } from '../../types/execution-sequence.types'

export function executionSequenceError(result: ExecutionSequenceResult): Error {
  const failure = result.failure
  const cause = failure?.cause
  const error = new Error(
    failure?.message ?? `执行流程 "${result.flowId}" 未成功完成`,
    cause === undefined ? undefined : { cause },
  ) as Error & {
    executionCode?: string
    executionId?: string
    executionNodeId?: string
  }
  if (cause instanceof Error) error.name = cause.name
  error.executionCode = failure?.code ?? result.code
  error.executionId = result.executionId
  error.executionNodeId = failure?.nodeId
  return error
}
