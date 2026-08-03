/**
 * Purpose: Traverse a validated execution graph and aggregate deterministic events, records, and terminal results.
 * Owner: foundation:utils
 * Responsibility: Sequence-level orchestration only; node invocation and graph validation are delegated.
 */

import type {
  ExecutionNodeRecord,
  ExecutionRecordStatus,
  ExecutionSequenceEvent,
  ExecutionSequenceFailure,
  ExecutionSequenceNode,
  ExecutionSequenceResult,
  RunExecutionSequenceOptions,
} from '../../types/execution-sequence.types'
import { validateExecutionFlowContract } from './flow-validation'
import {
  completeExecutionFailure,
  invokeExecutionNode,
  isFailureCompletion,
  type FailureCompletion,
  type NodeCompletion,
} from './node-invocation'
import { compareAscii } from './shared'

function collectDependents<TContext>(
  ordered: readonly ExecutionSequenceNode<TContext>[],
): Map<string, string[]> {
  const dependents = new Map(ordered.map((node) => [node.id, [] as string[]]))
  for (const node of ordered) {
    for (const dependency of node.dependsOn) dependents.get(dependency)?.push(node.id)
  }
  for (const nextIds of dependents.values()) nextIds.sort(compareAscii)
  return dependents
}

function collectParallelGroups<TContext>(
  ordered: readonly ExecutionSequenceNode<TContext>[],
): Map<string, ExecutionSequenceNode<TContext>[]> {
  const groups = new Map<string, ExecutionSequenceNode<TContext>[]>()
  for (const node of ordered) {
    if (!node.parallelGroup) continue
    const group = groups.get(node.parallelGroup) ?? []
    group.push(node)
    groups.set(node.parallelGroup, group)
  }
  return groups
}

export async function runExecutionSequence<TContext>(
  options: RunExecutionSequenceOptions<TContext>,
): Promise<ExecutionSequenceResult> {
  if (!options.executionId.trim()) {
    throw new Error('[ExecutionSequence] executionId 不得为空')
  }

  const ordered = validateExecutionFlowContract(options.flow, options.nodes)
  const dependents = collectDependents(ordered)
  const startedAt = Date.now()
  const events: ExecutionSequenceEvent[] = []
  const records: ExecutionNodeRecord[] = []
  const order = ordered.map((node) => node.id)
  const sequenceById = new Map(ordered.map((node, index) => [node.id, index + 1]))
  const parallelGroups = collectParallelGroups(ordered)

  const emit = (
    node: ExecutionSequenceNode<TContext>,
    sequence: number,
    status: ExecutionRecordStatus,
    code: string,
    message?: string,
  ): ExecutionSequenceEvent => {
    const event: ExecutionSequenceEvent = {
      flowId: options.flow.flowId,
      executionId: options.executionId,
      department: options.flow.department,
      subsystem: options.flow.subsystem,
      nodeId: node.id,
      owner: node.owner,
      failureTarget: node.failureTarget,
      phase: node.phase,
      sequence,
      status,
      code,
      at: Date.now(),
      nextNodeIds: status === 'succeeded' || status === 'skipped'
        ? [...(dependents.get(node.id) ?? [])]
        : [],
      ...(message ? { message } : {}),
    }
    events.push(event)
    options.onEvent?.(event)
    return event
  }

  const processed = new Set<string>()
  for (const orderedNode of ordered) {
    if (processed.has(orderedNode.id)) continue
    const unit = orderedNode.parallelGroup
      ? parallelGroups.get(orderedNode.parallelGroup) ?? [orderedNode]
      : [orderedNode]
    for (const node of unit) processed.add(node.id)

    const nodeStartedAt = Date.now()
    for (const node of unit) {
      emit(node, sequenceById.get(node.id)!, 'ready', node.outcomes.ready)
    }

    let completions: NodeCompletion<TContext>[]
    if (options.signal?.aborted || options.isCancelled?.()) {
      completions = unit.map((node) => completeExecutionFailure(
        node,
        sequenceById.get(node.id)!,
        nodeStartedAt,
        'cancelled',
        '执行已取消',
      ))
    } else {
      for (const node of unit) {
        emit(node, sequenceById.get(node.id)!, 'running', node.outcomes.running)
      }
      completions = await Promise.all(unit.map((node) => invokeExecutionNode(
        options,
        node,
        sequenceById.get(node.id)!,
        nodeStartedAt,
      )))
    }

    let firstFailure: FailureCompletion<TContext> | undefined
    for (const completion of completions) {
      const terminal = emit(
        completion.node,
        completion.sequence,
        completion.status,
        completion.code,
        completion.message,
      )
      records.push({
        nodeId: completion.node.id,
        owner: completion.node.owner,
        failureTarget: completion.node.failureTarget,
        phase: completion.node.phase,
        sequence: completion.sequence,
        status: completion.status,
        code: completion.code,
        startedAt: completion.startedAt,
        completedAt: completion.finishedAt,
        durationMs: Math.max(0, completion.finishedAt - completion.startedAt),
        nextNodeIds: terminal.nextNodeIds,
        ...(completion.message ? { message: completion.message } : {}),
        ...(completion.value === undefined ? {} : { value: completion.value }),
      })
      if (!firstFailure && isFailureCompletion(completion)) {
        firstFailure = completion
      }
    }

    if (firstFailure) {
      const completedAt = Date.now()
      const failure: ExecutionSequenceFailure = {
        nodeId: firstFailure.node.id,
        owner: firstFailure.node.owner,
        failureTarget: firstFailure.node.failureTarget,
        phase: firstFailure.node.phase,
        sequence: firstFailure.sequence,
        status: firstFailure.status,
        code: firstFailure.code,
        message: firstFailure.message
          ?? `节点 "${firstFailure.node.id}" 以 ${firstFailure.status} 终止`,
        ...(firstFailure.cause === undefined ? {} : { cause: firstFailure.cause }),
      }
      return {
        flowId: options.flow.flowId,
        executionId: options.executionId,
        owner: options.flow.owner,
        department: options.flow.department,
        subsystem: options.flow.subsystem,
        status: firstFailure.status === 'cancelled' ? 'cancelled' : 'failed',
        code: firstFailure.code,
        startedAt,
        completedAt,
        durationMs: Math.max(0, completedAt - startedAt),
        order,
        events,
        records,
        failure,
      }
    }
  }

  const completedAt = Date.now()
  return {
    flowId: options.flow.flowId,
    executionId: options.executionId,
    owner: options.flow.owner,
    department: options.flow.department,
    subsystem: options.flow.subsystem,
    status: 'succeeded',
    code: `${options.flow.flowId}:succeeded`,
    startedAt,
    completedAt,
    durationMs: Math.max(0, completedAt - startedAt),
    order,
    events,
    records,
  }
}
