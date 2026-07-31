import type {
  ExecutionNodeDescriptor,
  ExecutionNodeRecord,
  ExecutionNodeSignal,
  ExecutionNodeSignalStatus,
  ExecutionFlowRegistration,
  ExecutionOutcomeCodes,
  ExecutionPhase,
  ExecutionRecordStatus,
  ExecutionSequenceEvent,
  ExecutionSequenceFailure,
  ExecutionSequenceNode,
  ExecutionSequenceResult,
  ResolveExecutionOrderOptions,
  RunExecutionSequenceOptions,
} from '../types/execution-sequence.types'

const PHASE_ORDER: Record<ExecutionPhase, number> = {
  prepare: 0,
  ready: 1,
  execute: 2,
  transition: 3,
  finalize: 4,
}

const MACHINE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MACHINE_CODE_PATTERN = /^[a-z0-9]+(?:[a-z0-9:-]*[a-z0-9])?$/

function compareAscii(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

export function compareExecutionNodes(
  left: Pick<ExecutionNodeDescriptor, 'id' | 'phase' | 'order'>,
  right: Pick<ExecutionNodeDescriptor, 'id' | 'phase' | 'order'>,
): number {
  const phaseDelta = PHASE_ORDER[left.phase] - PHASE_ORDER[right.phase]
  if (phaseDelta !== 0) return phaseDelta
  if (left.order !== right.order) return left.order - right.order
  return compareAscii(left.id, right.id)
}

function assertMachineCode(value: string, label: string): void {
  if (!MACHINE_CODE_PATTERN.test(value)) {
    throw new Error(`[ExecutionSequence] ${label} "${value}" 必须为 ASCII 机器状态码`)
  }
}

function assertOutcomeCodes(
  flowId: string,
  node: ExecutionSequenceNode<unknown>,
): void {
  const entries = Object.entries(node.outcomes)
  const seen = new Set<string>()
  for (const [status, code] of entries) {
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

function assertMachineId(value: string, label: string): void {
  if (!MACHINE_ID_PATTERN.test(value)) {
    throw new Error(`[ExecutionSequence] ${label} "${value}" 必须为 ASCII kebab-case`)
  }
}

function assertLifecycleShape<T extends ExecutionNodeDescriptor>(nodes: readonly T[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const prepareNodes = nodes.filter((node) => node.phase === 'prepare')
  const readyNodes = nodes.filter((node) => node.phase === 'ready')
  const executeNodes = nodes.filter((node) => node.phase === 'execute')
  const transitionNodes = nodes.filter((node) => node.phase === 'transition')
  const finalizeNodes = nodes.filter((node) => node.phase === 'finalize')
  if (prepareNodes.length === 0) {
    throw new Error('[ExecutionSequence] 执行图缺少 prepare 节点')
  }
  if (readyNodes.length === 0) {
    throw new Error('[ExecutionSequence] 执行图缺少 ready 节点（就绪排队阶段）')
  }
  if (executeNodes.length === 0) {
    throw new Error('[ExecutionSequence] 执行图缺少 execute 节点')
  }
  if (transitionNodes.length === 0) {
    throw new Error('[ExecutionSequence] 执行图缺少 transition 节点（阻塞/等待过渡阶段）')
  }
  if (finalizeNodes.length === 0) {
    throw new Error('[ExecutionSequence] 执行图缺少 finalize 节点')
  }
  if (!prepareNodes.some((node) => node.dependsOn.length === 0)) {
    throw new Error('[ExecutionSequence] prepare 阶段必须包含无依赖的入口节点')
  }
  const previousPhase: Partial<Record<ExecutionPhase, ExecutionPhase>> = {
    ready: 'prepare',
    execute: 'ready',
    transition: 'execute',
    finalize: 'transition',
  }
  const reachesPhase = (
    node: T,
    targetPhase: ExecutionPhase,
    visiting: Set<string> = new Set(),
  ): boolean => {
    if (node.phase === targetPhase) return true
    if (visiting.has(node.id)) return false
    visiting.add(node.id)
    return node.dependsOn.some((dependency) => {
      const dependencyNode = byId.get(dependency)
      return dependencyNode !== undefined && reachesPhase(dependencyNode, targetPhase, visiting)
    })
  }
  for (const node of [...readyNodes, ...executeNodes, ...transitionNodes, ...finalizeNodes]) {
    const dependencyPhase = previousPhase[node.phase]
    if (dependencyPhase && !node.dependsOn.some((dependency) => {
      const dependencyNode = byId.get(dependency)
      return dependencyNode !== undefined && reachesPhase(dependencyNode, dependencyPhase)
    })) {
      throw new Error(
        `[ExecutionSequence] ${node.phase} 节点 "${node.id}" 必须由 ${dependencyPhase} 阶段释放`,
      )
    }
  }
  if (finalizeNodes.some((node) => 'optional' in node && node.optional === true)) {
    throw new Error('[ExecutionSequence] finalize 节点不得为可选')
  }

  const dependents = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      dependents.get(dependency)?.push(node.id)
    }
  }
  for (const node of nodes) {
    const next = dependents.get(node.id) ?? []
    if (next.length === 0 && node.phase !== 'finalize') {
      throw new Error(`[ExecutionSequence] 非 finalize 节点 "${node.id}" 没有后续节点`)
    }
  }
  const terminalNodes = nodes.filter((node) => (dependents.get(node.id) ?? []).length === 0)
  if (terminalNodes.length !== 1) {
    throw new Error(
      `[ExecutionSequence] 执行图必须有唯一终态节点，当前为 ${terminalNodes.length} 个: ${terminalNodes.map((node) => node.id).join(', ')}`,
    )
  }
}

function assertFlowRegistration(flow: ExecutionFlowRegistration): void {
  assertMachineId(flow.flowId, '流程标识')
  assertMachineId(flow.owner, '流程所有者')
  assertMachineId(flow.failureTarget, '流程故障接收者')
  assertMachineId(flow.department, '流程部门')
  assertMachineId(flow.subsystem, '流程子系统')
}

export function validateExecutionFlowContract<TContext>(
  flow: ExecutionFlowRegistration,
  nodes: readonly ExecutionSequenceNode<TContext>[],
): ExecutionSequenceNode<TContext>[] {
  assertFlowRegistration(flow)
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

export function resolveExecutionOrder<T extends ExecutionNodeDescriptor>(
  nodes: readonly T[],
  options: ResolveExecutionOrderOptions = {},
): T[] {
  if (nodes.length === 0) {
    throw new Error('[ExecutionSequence] 执行图不得为空')
  }

  const byId = new Map<string, T>()
  for (const node of nodes) {
    assertMachineId(node.id, '节点标识')
    assertMachineId(node.owner, `节点 "${node.id}" 所有者`)
    assertMachineId(node.failureTarget, `节点 "${node.id}" 故障接收者`)
    if (node.parallelGroup !== undefined) {
      assertMachineId(node.parallelGroup, `节点 "${node.id}" 并行组`)
    }
    if (!Number.isInteger(node.order)) {
      throw new Error(`[ExecutionSequence] 节点 "${node.id}" order 必须为整数`)
    }
    if (byId.has(node.id)) {
      throw new Error(`[ExecutionSequence] 节点标识重复: ${node.id}`)
    }
    byId.set(node.id, node)
  }

  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  for (const node of nodes) {
    inDegree.set(node.id, 0)
    dependents.set(node.id, [])
  }

  for (const node of nodes) {
    const seenDependencies = new Set<string>()
    for (const dependency of node.dependsOn) {
      if (dependency === node.id) {
        throw new Error(`[ExecutionSequence] 节点 "${node.id}" 不得依赖自身`)
      }
      if (seenDependencies.has(dependency)) {
        throw new Error(`[ExecutionSequence] 节点 "${node.id}" 重复声明依赖 "${dependency}"`)
      }
      seenDependencies.add(dependency)
      const dependencyNode = byId.get(dependency)
      if (!dependencyNode) {
        throw new Error(`[ExecutionSequence] 节点 "${node.id}" 依赖未声明节点 "${dependency}"`)
      }
      if (PHASE_ORDER[dependencyNode.phase] > PHASE_ORDER[node.phase]) {
        throw new Error(
          `[ExecutionSequence] 节点 "${node.id}" 不得依赖后续阶段 "${dependency}"`,
        )
      }
      dependents.get(dependency)?.push(node.id)
      inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1)
    }
  }

  const parallelGroups = new Map<string, T[]>()
  for (const node of nodes) {
    if (!node.parallelGroup) continue
    const group = parallelGroups.get(node.parallelGroup) ?? []
    group.push(node)
    parallelGroups.set(node.parallelGroup, group)
  }
  for (const [groupId, group] of parallelGroups) {
    if (group.length < 2) {
      throw new Error(`[ExecutionSequence] 并行组 "${groupId}" 至少需要两个节点`)
    }
    const [first] = group
    const expectedDependencies = [...first.dependsOn].sort(compareAscii)
    for (const node of group.slice(1)) {
      const dependencies = [...node.dependsOn].sort(compareAscii)
      if (
        node.phase !== first.phase
        || node.order !== first.order
        || dependencies.length !== expectedDependencies.length
        || dependencies.some((dependency, index) => dependency !== expectedDependencies[index])
      ) {
        throw new Error(
          `[ExecutionSequence] 并行组 "${groupId}" 必须位于同阶段、同依赖层并使用相同 order`,
        )
      }
    }
    const groupIds = new Set(group.map((node) => node.id))
    for (const node of group) {
      const internalDependencies = node.dependsOn.filter((dependency) => groupIds.has(dependency))
      if (internalDependencies.length > 0) {
        throw new Error(
          `[ExecutionSequence] 并行组 "${groupId}" 的节点不得相互依赖: ${node.id} -> ${internalDependencies.join(', ')}`,
        )
      }
    }
    const sameLayerPeers = nodes.filter((node) => {
      const dependencies = [...node.dependsOn].sort(compareAscii)
      return node.phase === first.phase
        && node.order === first.order
        && dependencies.length === expectedDependencies.length
        && dependencies.every((dependency, index) => dependency === expectedDependencies[index])
    })
    if (sameLayerPeers.some((node) => node.parallelGroup !== groupId)) {
      throw new Error(
        `[ExecutionSequence] 并行组 "${groupId}" 所在同级节点必须全部声明同一并行组`,
      )
    }
  }

  if (options.requireLifecyclePhases) {
    assertLifecycleShape(nodes)
  }

  const ready = nodes.filter((node) => inDegree.get(node.id) === 0)
  const ordered: T[] = []
  while (ready.length > 0) {
    ready.sort(compareExecutionNodes)
    const current = ready.shift()!
    ordered.push(current)
    const nextIds = [...(dependents.get(current.id) ?? [])].sort(compareAscii)
    for (const nextId of nextIds) {
      const nextDegree = (inDegree.get(nextId) ?? 1) - 1
      inDegree.set(nextId, nextDegree)
      if (nextDegree === 0) {
        ready.push(byId.get(nextId)!)
      }
    }
  }

  if (ordered.length !== nodes.length) {
    const unresolved = nodes
      .filter((node) => !ordered.some((orderedNode) => orderedNode.id === node.id))
      .map((node) => node.id)
      .sort(compareAscii)
    throw new Error(`[ExecutionSequence] 检测到循环依赖: ${unresolved.join(' -> ')}`)
  }

  for (const [groupId, group] of parallelGroups) {
    const positions = group
      .map((node) => ordered.findIndex((orderedNode) => orderedNode.id === node.id))
      .sort((left, right) => left - right)
    if (positions.at(-1)! - positions[0] + 1 !== positions.length) {
      throw new Error(`[ExecutionSequence] 并行组 "${groupId}" 必须在确定性执行序中形成连续单元`)
    }
  }

  return ordered
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
  runtime: ExecutionSequenceNode<TContext>['run'] extends (
    context: TContext,
    runtime: infer TRuntime,
  ) => unknown ? TRuntime : never,
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

export async function runExecutionSequence<TContext>(
  options: RunExecutionSequenceOptions<TContext>,
): Promise<ExecutionSequenceResult> {
  if (!options.executionId.trim()) {
    throw new Error('[ExecutionSequence] executionId 不得为空')
  }

  const ordered = validateExecutionFlowContract(options.flow, options.nodes)
  const dependents = new Map(ordered.map((node) => [node.id, [] as string[]]))
  for (const node of ordered) {
    for (const dependency of node.dependsOn) dependents.get(dependency)?.push(node.id)
  }
  for (const nextIds of dependents.values()) nextIds.sort(compareAscii)

  const startedAt = Date.now()
  const events: ExecutionSequenceEvent[] = []
  const records: ExecutionNodeRecord[] = []
  const order = ordered.map((node) => node.id)
  const sequenceById = new Map(ordered.map((node, index) => [node.id, index + 1]))
  const parallelGroups = new Map<string, ExecutionSequenceNode<TContext>[]>()
  for (const node of ordered) {
    if (!node.parallelGroup) continue
    const group = parallelGroups.get(node.parallelGroup) ?? []
    group.push(node)
    parallelGroups.set(node.parallelGroup, group)
  }

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

  type NodeCompletion = {
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

  type FailureCompletion = NodeCompletion & {
    status: ExecutionSequenceFailure['status']
  }

  const isFailureCompletion = (
    completion: NodeCompletion,
  ): completion is FailureCompletion => (
    completion.status !== 'succeeded' && completion.status !== 'skipped'
  )

  const completeFailure = (
    node: ExecutionSequenceNode<TContext>,
    sequence: number,
    startedAt: number,
    status: ExecutionSequenceFailure['status'],
    message: string,
    cause?: unknown,
  ): NodeCompletion => ({
    node,
    sequence,
    startedAt,
    finishedAt: Date.now(),
    status,
    code: node.outcomes[statusCodeKey(status)],
    message,
    ...(cause === undefined ? {} : { cause }),
  })

  const invokeNode = async (
    node: ExecutionSequenceNode<TContext>,
    sequence: number,
    nodeStartedAt: number,
  ): Promise<NodeCompletion> => {
    const controller = new AbortController()
    const abortFromParent = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', abortFromParent, { once: true })

    try {
      let rawSignal: unknown
      if (await node.shouldSkip?.(options.context)) {
        if (!node.optional) {
          return completeFailure(
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
        return completeFailure(node, sequence, nodeStartedAt, 'cancelled', '执行已取消')
      }
      if (rawSignal === undefined) {
        return completeFailure(
          node,
          sequence,
          nodeStartedAt,
          'missing-status',
          `节点 "${node.id}" 已返回但未提供状态码`,
        )
      }
      if (Array.isArray(rawSignal)) {
        return completeFailure(
          node,
          sequence,
          nodeStartedAt,
          'duplicate-status',
          `节点 "${node.id}" 返回了 ${rawSignal.length} 个终结状态`,
        )
      }
      if (typeof rawSignal !== 'object' || rawSignal === null || !('status' in rawSignal)) {
        return completeFailure(
          node,
          sequence,
          nodeStartedAt,
          'invalid-status',
          `节点 "${node.id}" 返回了无效状态结构`,
        )
      }

      const signal = rawSignal as ExecutionNodeSignal
      if (!['succeeded', 'skipped', 'blocked', 'failed', 'cancelled'].includes(signal.status)) {
        return completeFailure(
          node,
          sequence,
          nodeStartedAt,
          'invalid-status',
          `节点 "${node.id}" 返回了未声明状态 "${String(signal.status)}"`,
        )
      }
      if (signal.status === 'skipped' && !node.optional) {
        return completeFailure(
          node,
          sequence,
          nodeStartedAt,
          'invalid-status',
          `必需节点 "${node.id}" 不得跳过`,
        )
      }

      const expectedCode = node.outcomes[statusCodeKey(signal.status)]
      if (signal.code !== undefined && signal.code !== expectedCode) {
        return completeFailure(
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
        return completeFailure(node, sequence, nodeStartedAt, 'timed-out', error.message, error)
      }
      if (isAbortError(error) || options.signal?.aborted) {
        return completeFailure(node, sequence, nodeStartedAt, 'cancelled', errorMessage(error), error)
      }
      return completeFailure(node, sequence, nodeStartedAt, 'failed', errorMessage(error), error)
    } finally {
      options.signal?.removeEventListener('abort', abortFromParent)
    }
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

    let completions: NodeCompletion[]
    if (options.signal?.aborted || options.isCancelled?.()) {
      completions = unit.map((node) => completeFailure(
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
      completions = await Promise.all(unit.map((node) => invokeNode(
        node,
        sequenceById.get(node.id)!,
        nodeStartedAt,
      )))
    }

    let firstFailure: FailureCompletion | undefined
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
