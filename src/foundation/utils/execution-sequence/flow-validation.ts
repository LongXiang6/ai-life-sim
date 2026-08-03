/**
 * Purpose: Validate a registered flow against its declared execution nodes.
 * Owner: foundation:utils
 * Responsibility: Flow ownership and outcome-contract validation only.
 */

import type {
  ExecutionFlowRegistration,
  ExecutionSequenceNode,
} from '../../types/execution-sequence.types'
import { resolveExecutionOrder } from './execution-order'
import { assertOutcomeCodes } from './outcome-codes'
import { assertMachineId } from './shared'

export function validateExecutionFlowContract<TContext>(
  flow: ExecutionFlowRegistration,
  nodes: readonly ExecutionSequenceNode<TContext>[],
): ExecutionSequenceNode<TContext>[] {
  assertMachineId(flow.flowId, '流程标识')
  assertMachineId(flow.owner, '流程所有者')
  assertMachineId(flow.failureTarget, '流程故障接收者')
  assertMachineId(flow.department, '流程部门')
  assertMachineId(flow.subsystem, '流程子系统')
  for (const node of nodes) {
    if (node.failureTarget !== flow.failureTarget) {
      throw new Error(
        `[ExecutionSequence] 节点 "${node.id}" 的故障接收者必须为流程登记值 "${flow.failureTarget}"`,
      )
    }
    assertOutcomeCodes(flow.flowId, node as ExecutionSequenceNode<unknown>)
  }
  return resolveExecutionOrder(nodes, { requireLifecyclePhases: true })
}
