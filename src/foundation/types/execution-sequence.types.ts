/** 执行序阶段，位置固定且不得跨阶段逆向依赖。 */
export const EXECUTION_PHASES = ['prepare', 'execute', 'transition', 'finalize'] as const

export type ExecutionPhase = (typeof EXECUTION_PHASES)[number]

/** 节点主动返回的终结状态。 */
export type ExecutionNodeSignalStatus =
  | 'succeeded'
  | 'skipped'
  | 'blocked'
  | 'failed'
  | 'cancelled'

/** 流程所有者可记录的全部状态。 */
export type ExecutionRecordStatus =
  | 'ready'
  | 'running'
  | ExecutionNodeSignalStatus
  | 'timed-out'
  | 'missing-status'
  | 'invalid-status'
  | 'duplicate-status'

/** 节点允许发出的唯一机器状态码。 */
export interface ExecutionOutcomeCodes {
  ready: string
  running: string
  succeeded: string
  skipped: string
  blocked: string
  failed: string
  cancelled: string
  timedOut: string
  missingStatus: string
  invalidStatus: string
  duplicateStatus: string
}

/** 任何可排序系统或功能组件都先声明这四项。 */
export interface ExecutionNodeDescriptor {
  id: string
  /** 节点实现与诊断的唯一所有者。 */
  owner: string
  /** 终止性故障必须返回的唯一接收者。 */
  failureTarget: string
  phase: ExecutionPhase
  dependsOn: readonly string[]
  order: number
  /**
   * 显式并行组。只有同阶段、同依赖层、同 order 的节点可以共享该标识；
   * 组内动作并发执行，终结结果仍按 order 与节点标识确定性汇合。
   */
  parallelGroup?: string
}

export interface ExecutionNodeRuntime {
  flowId: string
  executionId: string
  nodeId: string
  phase: ExecutionPhase
  sequence: number
  signal: AbortSignal
}

export interface ExecutionNodeSignal<T = unknown> {
  status: ExecutionNodeSignalStatus
  /** 省略时使用节点声明的对应状态码；显式值必须与声明一致。 */
  code?: string
  message?: string
  value?: T
}

export interface ExecutionSequenceNode<TContext = unknown, TValue = unknown>
  extends ExecutionNodeDescriptor {
  outcomes: ExecutionOutcomeCodes
  optional?: boolean
  /** 只在节点能够响应 runtime.signal 时设置。 */
  timeoutMs?: number
  shouldSkip?: (context: TContext) => boolean | Promise<boolean>
  run: (
    context: TContext,
    runtime: ExecutionNodeRuntime,
  ) => ExecutionNodeSignal<TValue> | readonly ExecutionNodeSignal<TValue>[] | undefined
    | Promise<ExecutionNodeSignal<TValue> | readonly ExecutionNodeSignal<TValue>[] | undefined>
}

export interface ExecutionSequenceEvent {
  flowId: string
  executionId: string
  nodeId: string
  owner: string
  failureTarget: string
  phase: ExecutionPhase
  sequence: number
  status: ExecutionRecordStatus
  code: string
  at: number
  nextNodeIds: string[]
  message?: string
}

export interface ExecutionNodeRecord<T = unknown> {
  nodeId: string
  owner: string
  failureTarget: string
  phase: ExecutionPhase
  sequence: number
  status: Exclude<ExecutionRecordStatus, 'ready' | 'running'>
  code: string
  startedAt: number
  completedAt: number
  durationMs: number
  nextNodeIds: string[]
  message?: string
  value?: T
}

export interface ExecutionSequenceFailure {
  nodeId: string
  owner: string
  failureTarget: string
  phase: ExecutionPhase
  sequence: number
  status: Exclude<ExecutionRecordStatus, 'ready' | 'running' | 'succeeded' | 'skipped'>
  code: string
  message: string
  cause?: unknown
}

export interface ExecutionSequenceResult {
  flowId: string
  executionId: string
  owner: string
  status: 'succeeded' | 'failed' | 'cancelled'
  code: string
  startedAt: number
  completedAt: number
  durationMs: number
  order: string[]
  events: ExecutionSequenceEvent[]
  records: ExecutionNodeRecord[]
  failure?: ExecutionSequenceFailure
}

export interface ResolveExecutionOrderOptions {
  requireLifecyclePhases?: boolean
}

export interface RunExecutionSequenceOptions<TContext> {
  flowId: string
  executionId: string
  /** 流程迁移与终态发布的唯一所有者。 */
  owner: string
  context: TContext
  nodes: readonly ExecutionSequenceNode<TContext>[]
  signal?: AbortSignal
  isCancelled?: () => boolean
  onEvent?: (event: ExecutionSequenceEvent) => void
}
