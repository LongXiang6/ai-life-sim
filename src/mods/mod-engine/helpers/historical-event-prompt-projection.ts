/**
 * @module historical-event-prompt-projection.ts
 * @description 将历史事件账本的当前相关视图确定性投影为主叙事 Prompt 事实卡
 * @mod mod-engine
 *
 * 账本继续拥有事实、状态、作用域与因果边；本文件只读取 collectState() 的公开契约，
 * 不查询完整历史、不缓存事实，也不使用世界观适配 AI 改写或概括内容。
 */

import type {
  HistoricalCausalEdge,
  HistoricalCausalRelation,
  HistoricalEventLedgerContract,
  HistoricalEventScope,
  HistoricalEventStatus,
  HistoricalEventView,
  SubSystemState,
} from '@/foundation'

export const HISTORICAL_EVENT_LEDGER_ID = 'historical-event-ledger'

const CONTINUATION_STATUSES = new Set<HistoricalEventStatus>(['scheduled', 'active'])

const STATUS_LABELS: Record<'scheduled' | 'active', string> = {
  scheduled: '待发生',
  active: '进行中',
}

const SCOPE_LABELS: Record<HistoricalEventScope['kind'], string> = {
  global: '全局',
  context: '当地上下文',
  travel: '旅行链',
  'cross-context': '跨上下文',
}

const RELATION_LABELS: Record<HistoricalCausalRelation, string> = {
  causes: '导致',
  enables: '使之成为可能',
  blocks: '阻止',
  resolves: '解决',
  amplifies: '放大',
  propagates: '传播到',
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Prompt 的语义边界：全局事实对所有当前世界可见；其余作用域必须显式包含当前上下文。
 * 这会隔离只属于后台、休眠、关闭或其他世界的当地事实，同时保留真正跨入当前世界的事件。
 */
function isCurrentPromptScope(scope: HistoricalEventScope, currentContextId: string): boolean {
  return scope.kind === 'global' || scope.contextIds.includes(currentContextId)
}

function formatScope(scope: HistoricalEventScope): string {
  const ids = scope.contextIds.length > 0
    ? `[${scope.contextIds.join('、')}]`
    : ''
  return `${SCOPE_LABELS[scope.kind]}${ids}`
}

function formatSchedule(event: HistoricalEventView): string | undefined {
  if (!event.schedule) return undefined
  const parts = [
    event.schedule.dueTotalDays !== undefined
      ? `全局第${event.schedule.dueTotalDays}天`
      : undefined,
    event.schedule.dueRoundSequence !== undefined
      ? `第${event.schedule.dueRoundSequence}轮`
      : undefined,
    event.schedule.legacyYear !== undefined
      ? `旧纪年${event.schedule.legacyYear}`
      : undefined,
    event.schedule.conditionLabel,
  ].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join('、') : undefined
}

function formatEvent(event: HistoricalEventView): string {
  const status = event.status === 'active' ? 'active' : 'scheduled'
  const schedule = formatSchedule(event)
  return [
    `历史事件[${event.eventId}]`,
    `状态：${STATUS_LABELS[status]}`,
    `作用域：${formatScope(event.scope)}`,
    `标题：${event.title}`,
    `已确认事实：${event.description}`,
    schedule ? `处理条件：${schedule}` : undefined,
  ].filter(Boolean).join('；')
}

function formatEdge(edge: HistoricalCausalEdge): string {
  return [
    `显式因果边[${edge.edgeId}]`,
    `作用域：${formatScope(edge.scope)}`,
    `关系：事件[${edge.fromEventId}]${RELATION_LABELS[edge.relation]}事件[${edge.toEventId}]`,
    edge.label ? `说明：${edge.label}` : undefined,
  ].filter(Boolean).join('；')
}

function readLedgerContract(state: SubSystemState | undefined): HistoricalEventLedgerContract | undefined {
  if (state?.id !== HISTORICAL_EVENT_LEDGER_ID || !isPlainRecord(state.data)) return undefined
  const candidate = state.data as Partial<HistoricalEventLedgerContract>
  if (
    typeof candidate.contextId !== 'string'
    || !Array.isArray(candidate.relevantEvents)
    || !Array.isArray(candidate.relevantCausalEdges)
  ) {
    return undefined
  }
  return candidate as HistoricalEventLedgerContract
}

/**
 * 只消费账本已经投影出的相关视图，并再次按当前上下文、待续状态和相关端点收窄。
 * 不设固定条数上限，避免按容量丢弃未解决事实；边界来自状态与作用域，而非数组位置。
 */
export function buildHistoricalEventPromptProjection(
  state: SubSystemState | undefined,
  currentContextId: string,
): string | undefined {
  const contract = readLedgerContract(state)
  if (!contract || contract.contextId !== currentContextId) return undefined

  const events = contract.relevantEvents.filter((event) => (
    CONTINUATION_STATUSES.has(event.status)
    && isCurrentPromptScope(event.scope, currentContextId)
  ))
  if (events.length === 0) return undefined

  const relevantEventIds = new Set(events.map((event) => event.eventId))
  const edges = contract.relevantCausalEdges.filter((edge) => (
    isCurrentPromptScope(edge.scope, currentContextId)
    && (relevantEventIds.has(edge.fromEventId) || relevantEventIds.has(edge.toEventId))
  ))

  return [
    '【历史事件账本：当前待续事实】',
    ...events.map(formatEvent),
    ...edges.map(formatEdge),
  ].join('\n')
}
