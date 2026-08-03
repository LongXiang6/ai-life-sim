/**
 * Purpose: Invoke one execution node with cancellation, timeout, skip, and terminal-signal validation.
 * Owner: foundation:utils
 * Responsibility: Single-node execution only; graph traversal and result aggregation are handled by the runner.
 */

import type {
  ExecutionNodeRuntime,
  ExecutionNodeSignal,
  ExecutionNodeSignalStatus,
  ExecutionOutcomeCodes,
  ExecutionRecordStatus,
  ExecutionSequenceFailure,
  ExecutionSequenceNode,
  RunExecutionSequenceOptions,
} from '../../types/execution-sequence.types'

export type NodeCompletion<TContext> = {
  node: ExecutionSequenceNode<TContext>
  sequence: number
  startedAt: number
  finishedAt: number
  status: Exclude<ExecutionRecordStatus, 'ready' | 'running'>
  code: string
  message?: string
  value?: unknown
  cause?: unknown
}

export type FailureCompletion<TContext> = NodeCompletion<TContext> & {
  status: ExecutionSequenceFailure['status']
}

function statusCodeKey(status: ExecutionRecordStatus): keyof ExecutionOutcomeCodes {
  switch (status) {
    case 'timed-out': return 'timedOut'
    case 'missing-status': return 'missingStatus'
    case 'invalid-status': return 'invalidStatus'
    case 'duplicate-status': return 'duplicateStatus'
    default: return status
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

class NodeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`节点超过契约时限 ${timeoutMs}ms`)
    this.name = 'ExecutionNodeTimeoutError'
  }
}

async function runNodeWithTimeout<TContext>(
  node: ExecutionSequenceNode<TContext>,
  context: TContext,
  runtime: ExecutionNodeRuntime,
): Promise<unknown> {
  const invocation = Promise.resolve(node.run(context, runtime))
  if (node.timeoutMs === undefined) return invocation
  if (!Number.isInteger(node.timeoutMs) || node.timeoutMs <= 0) {
    throw new Error(`节点 "${node.id}" timeoutMs 必须为正整数`)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      invocation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new NodeTimeoutError(node.timeoutMs!)), node.timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export function completeExecutionFailure<TContext>(
  node: ExecutionSequenceNode<TContext>,
  sequence: number,
  startedAt: number,
  status: ExecutionSequenceFailure['status'],
  message: string,
  cause?: unknown,
): NodeCompletion<TContext> {
  return {
    node,
    sequence,
    startedAt,
    finishedAt: Date.now(),
    status,
    code: node.outcomes[statusCodeKey(status)],
    message,
    ...(cause === undefined ? {} : { cause }),
  }
}

export function isFailureCompletion<TContext>(
  completion: NodeCompletion<TContext>,
): completion is FailureCompletion<TContext> {
  return completion.status !== 'succeeded' && completion.status !== 'skipped'
}

export async function invokeExecutionNode<TContext>(
  options: RunExecutionSequenceOptions<TContext>,
  node: ExecutionSequenceNode<TContext>,
  sequence: number,
  nodeStartedAt: number,
): Promise<NodeCompletion<TContext>> {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abortFromParent, { once: true })

  try {
    let rawSignal: unknown
    if (await node.shouldSkip?.(options.context)) {
      if (!node.optional) {
        return completeExecutionFailure(
          node,
          sequence,
          nodeStartedAt,
          'invalid-status',
          '非可选节点返回了跳过条件',
        )
      }
      rawSignal = { status: 'skipped' satisfies ExecutionNodeSignalStatus }
    } else {
      rawSignal = await runNodeWithTimeout(node, options.context, {
        flowId: options.flow.flowId,
        executionId: options.executionId,
        nodeId: node.id,
        phase: node.phase,
        sequence,
        signal: controller.signal,
      })
    }

    if (options.signal?.aborted || options.isCancelled?.()) {
      return completeExecutionFailure(node, sequence, nodeStartedAt, 'cancelled', '执行已取消')
    }
    if (rawSignal === undefined) {
      return completeExecutionFailure(
        node,
        sequence,
        nodeStartedAt,
        'missing-status',
        `节点 "${node.id}" 已返回但未提供状态码`,
      )
    }
    if (Array.isArray(rawSignal)) {
      return completeExecutionFailure(
        node,
        sequence,
        nodeStartedAt,
        'duplicate-status',
        `节点 "${node.id}" 返回了 ${rawSignal.length} 个终结状态`,
      )
    }
    if (typeof rawSignal !== 'object' || rawSignal === null || !('status' in rawSignal)) {
      return completeExecutionFailure(
        node,
        sequence,
        nodeStartedAt,
        'invalid-status',
        `节点 "${node.id}" 返回了无效状态结构`,
      )
    }

    const signal = rawSignal as ExecutionNodeSignal
    if (!['succeeded', 'skipped', 'blocked', 'failed', 'cancelled'].includes(signal.status)) {
      return completeExecutionFailure(
        node,
        sequence,
        nodeStartedAt,
        'invalid-status',
        `节点 "${node.id}" 返回了未声明状态 "${String(signal.status)}"`,
      )
    }
    if (signal.status === 'skipped' && !node.optional) {
      return completeExecutionFailure(
        node,
        sequence,
        nodeStartedAt,
        'invalid-status',
        `必需节点 "${node.id}" 不得跳过`,
      )
    }

    const expectedCode = node.outcomes[statusCodeKey(signal.status)]
    if (signal.code !== undefined && signal.code !== expectedCode) {
      return completeExecutionFailure(
        node,
        sequence,
        nodeStartedAt,
        'invalid-status',
        `节点 "${node.id}" 返回未声明状态码 "${signal.code}"`,
      )
    }

    return {
      node,
      sequence,
      startedAt: nodeStartedAt,
      finishedAt: Date.now(),
      status: signal.status,
      code: expectedCode,
      ...(signal.message ? { message: signal.message } : {}),
      ...(signal.value === undefined ? {} : { value: signal.value }),
    }
  } catch (error) {
    if (error instanceof NodeTimeoutError) {
      controller.abort(error)
      return completeExecutionFailure(node, sequence, nodeStartedAt, 'timed-out', error.message, error)
    }
    if (isAbortError(error) || options.signal?.aborted) {
      return completeExecutionFailure(node, sequence, nodeStartedAt, 'cancelled', errorMessage(error), error)
    }
    return completeExecutionFailure(node, sequence, nodeStartedAt, 'failed', errorMessage(error), error)
  } finally {
    options.signal?.removeEventListener('abort', abortFromParent)
  }
}
