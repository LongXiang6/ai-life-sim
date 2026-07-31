/**
 * @module development-system-diagnostic.ts
 * @description 本地开发系统边界诊断契约与浏览器回合内聚合器。
 *
 * 这里只记录系统阶段结果，不记录点击、按键、导航、输入或完整 Prompt/响应。
 * 完整 AI 原文仍由代理和逐轮 TXT 归档负责；本模块只把关键系统是否工作串起来。
 */

import type {
  ExecutionPhase,
  ExecutionRecordStatus,
  ExecutionSequenceResult,
} from '@/foundation'

export type DevelopmentSystemStatus = 'ok' | 'warning' | 'error' | 'skipped'

export const DEVELOPMENT_INCIDENT_CATEGORIES = [
  'entity-directory-missing',
  'context-missing',
  'dependency-unregistered',
  'schema-conflict',
  'timed-out',
  'missing-status',
  'invalid-status',
  'duplicate-status',
  'blocked',
  'cancelled',
  'upstream-failure',
] as const

export type DevelopmentIncidentCategory = (typeof DEVELOPMENT_INCIDENT_CATEGORIES)[number]

export interface DevelopmentSystemError {
  name?: string
  message: string
  stack?: string
}

export interface DevelopmentExecutionEvent {
  flowId: string
  executionId: string
  department: string
  subsystem: string
  component: string
  phase: ExecutionPhase
  sequence: number
  status: ExecutionRecordStatus
  code: string
  owner: string
  failureTarget: string
  nextNodeIds: string[]
  terminal: boolean
}

export interface DevelopmentSystemEvent {
  schemaVersion: 1
  timestamp: number
  system: string
  event: string
  status: DevelopmentSystemStatus
  lifeRunId?: string
  round?: number
  durationMs?: number
  category?: DevelopmentIncidentCategory
  execution?: DevelopmentExecutionEvent
  details?: Record<string, unknown>
  error?: DevelopmentSystemError
}

const pendingEvents: DevelopmentSystemEvent[] = []
const MAX_PENDING_EVENTS = 512

function isDevelopmentBuild(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'development'
}

function errorSnapshot(error: unknown): DevelopmentSystemError | undefined {
  if (error === undefined || error === null) return undefined
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const value = error as { name?: unknown; message: unknown; stack?: unknown }
    return {
      ...(typeof value.name === 'string' ? { name: value.name } : {}),
      message: String(value.message),
      ...(typeof value.stack === 'string' ? { stack: value.stack } : {}),
    }
  }
  return { message: String(error) }
}

/**
 * 在浏览器端把系统事件暂存到当前进程；不会单独发起日志请求。
 * 回合结束时由 narrative-round-diagnostic 一次性随 outcome 发送。
 */
export function recordDevelopmentSystemEvent(input: {
  system: string
  event: string
  status?: DevelopmentSystemStatus
  lifeRunId?: string
  round?: number
  durationMs?: number
  category?: DevelopmentIncidentCategory
  execution?: DevelopmentExecutionEvent
  details?: Record<string, unknown>
  error?: unknown
}): void {
  if (!isDevelopmentBuild() || typeof window === 'undefined') return
  const event: DevelopmentSystemEvent = {
    schemaVersion: 1,
    timestamp: Date.now(),
    system: input.system,
    event: input.event,
    status: input.status ?? 'ok',
    ...(input.lifeRunId ? { lifeRunId: input.lifeRunId } : {}),
    ...(input.round !== undefined ? { round: input.round } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.execution !== undefined ? { execution: structuredClone(input.execution) } : {}),
    ...(input.details !== undefined ? { details: input.details } : {}),
    ...(input.error !== undefined ? { error: errorSnapshot(input.error) } : {}),
  }
  pendingEvents.push(event)
  if (pendingEvents.length > MAX_PENDING_EVENTS) pendingEvents.splice(0, pendingEvents.length - MAX_PENDING_EVENTS)
}

export function classifyDevelopmentIncident(input: {
  status?: ExecutionRecordStatus
  message?: string
}): DevelopmentIncidentCategory | undefined {
  const message = input.message?.toLowerCase() ?? ''
  if (message.includes('实体引用目录') && /(未在|缺失|不存在|未登记)/u.test(message)) {
    return 'entity-directory-missing'
  }
  if (message.includes('上下文') && /(缺少|缺失|不存在|无效|未登记)/u.test(message)) {
    return 'context-missing'
  }
  if (message.includes('依赖') && /(未登记|未声明|未知|不存在)/u.test(message)) {
    return 'dependency-unregistered'
  }
  if (message.includes('schema') && /(冲突|不一致|无效|拒绝|失败)/u.test(message)) {
    return 'schema-conflict'
  }
  switch (input.status) {
    case 'timed-out': return 'timed-out'
    case 'missing-status': return 'missing-status'
    case 'invalid-status': return 'invalid-status'
    case 'duplicate-status': return 'duplicate-status'
    case 'blocked': return 'blocked'
    case 'cancelled': return 'cancelled'
    case 'failed': return 'upstream-failure'
    default: return undefined
  }
}

function developmentStatus(status: ExecutionRecordStatus): DevelopmentSystemStatus {
  if (status === 'skipped') return 'skipped'
  if (status === 'blocked' || status === 'cancelled') return 'warning'
  if (
    status === 'failed'
    || status === 'timed-out'
    || status === 'missing-status'
    || status === 'invalid-status'
    || status === 'duplicate-status'
  ) return 'error'
  return 'ok'
}

/** 将共享执行器的原始事件写入既有开发诊断队列；业务状态仍由 owning system 持有。 */
export function recordExecutionSequenceResult(
  result: ExecutionSequenceResult,
  scope: { lifeRunId?: string; round?: number } = {},
): void {
  const records = new Map(result.records.map((record) => [record.nodeId, record]))
  for (const event of result.events) {
    const record = records.get(event.nodeId)
    const terminal = event.status !== 'ready' && event.status !== 'running'
    const category = classifyDevelopmentIncident({ status: event.status, message: event.message })
    const status = developmentStatus(event.status)
    recordDevelopmentSystemEvent({
      system: event.owner,
      event: 'execution-node-state',
      status,
      ...scope,
      ...(terminal && record ? { durationMs: record.durationMs } : {}),
      ...(category ? { category } : {}),
      execution: {
        flowId: event.flowId,
        executionId: event.executionId,
        department: event.department,
        subsystem: event.subsystem,
        component: event.nodeId,
        phase: event.phase,
        sequence: event.sequence,
        status: event.status,
        code: event.code,
        owner: event.owner,
        failureTarget: event.failureTarget,
        nextNodeIds: [...event.nextNodeIds],
        terminal,
      },
      details: {
        flowOwner: result.owner,
        flowStatus: result.status,
        ...(event.message ? { message: event.message } : {}),
      },
      ...(status === 'error' && event.message ? { error: new Error(event.message) } : {}),
    })
  }
}

/** 取出某一真实回合的事件；其他回合事件继续留在内存中。 */
export function drainDevelopmentSystemEvents(
  lifeRunId: string,
  round: number,
): DevelopmentSystemEvent[] {
  if (!isDevelopmentBuild() || typeof window === 'undefined') return []
  const matched: DevelopmentSystemEvent[] = []
  const remaining: DevelopmentSystemEvent[] = []
  for (const event of pendingEvents) {
    const unscoped = event.lifeRunId === undefined && event.round === undefined
    if (unscoped || (event.lifeRunId === lifeRunId && event.round === round)) matched.push(event)
    else remaining.push(event)
  }
  pendingEvents.splice(0, pendingEvents.length, ...remaining)
  return matched.map((event) => structuredClone(event))
}

/** 测试/热更新清理，不影响任何业务状态。 */
export function clearDevelopmentSystemEventsForTests(): void {
  pendingEvents.length = 0
}
