/**
 * Purpose: Build and validate the status-code vocabulary for an execution node.
 * Owner: foundation:utils
 * Responsibility: Outcome code derivation and code-set validation only.
 */

import type {
  ExecutionOutcomeCodes,
  ExecutionSequenceNode,
} from '../../types/execution-sequence.types'
import { assertMachineCode } from './shared'

export function createExecutionOutcomeCodes(
  flowId: string,
  nodeId: string,
): ExecutionOutcomeCodes {
  const prefix = `${flowId}:${nodeId}`
  return {
    ready: `${prefix}:ready`,
    running: `${prefix}:running`,
    succeeded: `${prefix}:succeeded`,
    skipped: `${prefix}:skipped`,
    blocked: `${prefix}:blocked`,
    failed: `${prefix}:failed`,
    cancelled: `${prefix}:cancelled`,
    timedOut: `${prefix}:timed-out`,
    missingStatus: `${prefix}:missing-status`,
    invalidStatus: `${prefix}:invalid-status`,
    duplicateStatus: `${prefix}:duplicate-status`,
  }
}

export function assertOutcomeCodes(
  flowId: string,
  node: ExecutionSequenceNode<unknown>,
): void {
  const seen = new Set<string>()
  for (const [status, code] of Object.entries(node.outcomes)) {
    assertMachineCode(code, `节点 "${node.id}" 的 ${status} 状态码`)
    if (seen.has(code)) {
      throw new Error(`[ExecutionSequence] 节点 "${node.id}" 的状态码重复: ${code}`)
    }
    seen.add(code)
  }

  const expected = createExecutionOutcomeCodes(flowId, node.id)
  for (const [status, code] of Object.entries(expected)) {
    if (node.outcomes[status as keyof ExecutionOutcomeCodes] !== code) {
      throw new Error(
        `[ExecutionSequence] 节点 "${node.id}" 的 ${status} 状态码必须登记为 "${code}"`,
      )
    }
  }
}
