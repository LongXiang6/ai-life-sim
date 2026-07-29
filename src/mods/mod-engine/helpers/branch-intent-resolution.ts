/**
 * @module branch-intent-resolution.ts
 * @description 命运选择意图的持久化状态、结构化结果校验与 Prompt 注入
 * @mod mod-engine
 */

import {
  NarrativeIntentResolutionSchema,
  type NarrativeIntentResolution,
} from './narrative-semantic-signals'
import {
  AI_INTENT_EXECUTION_MODES,
  AI_INTENT_FEASIBILITIES,
  AI_INTENT_RISK_LEVELS,
  AI_INTENT_STATUSES,
  toNarrativeAIIntentId,
  translateInternalIntentResolutionToAI,
} from './narrative-ai-protocol'

export interface BranchIntentState {
  intentId: string
  branchId: string
  choice: string
  createdRound: number
  updatedRound: number
  resolution?: NarrativeIntentResolution
  /** 生命周期只在本地历史中使用；活动意图省略该字段。 */
  lifecycle?: 'active' | 'superseded' | 'abandoned' | 'terminal'
  supersededBy?: string
}

export interface BranchIntentCollection {
  intents: BranchIntentState[]
  focusedIntentId?: string
  /** 被新目标替代的旧意图，保留以便审计与存档恢复。 */
  archivedIntents?: BranchIntentState[]
}

/** EngineStore 只持久化该兼容投影；运行时所有权仍属于 orchestrator。 */
export interface BranchIntentProjection {
  branchIntents: BranchIntentState[]
  archivedBranchIntents: BranchIntentState[]
  focusedBranchIntentId?: string
}

export interface BranchIntentCommitResult extends BranchIntentCollection {
  committed?: NarrativeIntentResolution
  error?: string
  terminal: boolean
}

export interface BranchIntentHistoryEntry {
  id?: string
  resolvedChoice?: string
  resolvedChoiceRound?: number
  intentResolution?: NarrativeIntentResolution
  round?: number
}

const TERMINAL_INTENT_STATUSES = new Set<NarrativeIntentResolution['status']>([
  'succeeded',
  'partially_succeeded',
  'failed',
])
const BRANCH_INTENT_PERSISTED_KEYS = new Set([
  'intentId',
  'branchId',
  'choice',
  'createdRound',
  'updatedRound',
  'resolution',
  'lifecycle',
  'supersededBy',
])
const BRANCH_INTENT_PROJECTION_KEYS = new Set([
  'branchIntents',
  'archivedBranchIntents',
  'focusedBranchIntentId',
])

export function createBranchIntentState(
  branchId: string,
  choice: string,
  round: number,
): BranchIntentState {
  return {
    intentId: `branch:${branchId}`,
    branchId,
    choice,
    createdRound: round,
    updatedRound: round,
  }
}

export function findFocusedBranchIntent(
  intents: readonly BranchIntentState[],
  focusedIntentId: string | undefined,
): BranchIntentState | undefined {
  if (!focusedIntentId) return undefined
  return intents.find((intent) => intent.intentId === focusedIntentId)
}

export function findMostRecentlyUpdatedBranchIntentId(
  intents: readonly BranchIntentState[],
): string | undefined {
  let latest: BranchIntentState | undefined
  for (const intent of intents) {
    if (!latest
      || intent.updatedRound > latest.updatedRound
      || (intent.updatedRound === latest.updatedRound && intent.createdRound > latest.createdRound)) {
      latest = intent
    }
  }
  return latest?.intentId
}

function normalizePersistedBranchIntent(
  value: unknown,
  expected: 'active' | 'archived',
): BranchIntentState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  if (Object.keys(value).some((key) => !BRANCH_INTENT_PERSISTED_KEYS.has(key))) return undefined
  const raw = value as Partial<BranchIntentState>
  if (typeof raw.intentId !== 'string' || !raw.intentId.trim()
    || typeof raw.branchId !== 'string' || !raw.branchId.trim()
    || raw.intentId !== `branch:${raw.branchId}`
    || typeof raw.choice !== 'string' || !raw.choice.trim()
    || typeof raw.createdRound !== 'number'
    || !Number.isInteger(raw.createdRound) || raw.createdRound < 0
    || typeof raw.updatedRound !== 'number'
    || !Number.isInteger(raw.updatedRound) || raw.updatedRound < raw.createdRound) {
    return undefined
  }

  const lifecycle = raw.lifecycle
  if (expected === 'active' && lifecycle !== undefined && lifecycle !== 'active') return undefined
  if (expected === 'archived'
    && lifecycle !== 'superseded'
    && lifecycle !== 'abandoned'
    && lifecycle !== 'terminal') return undefined
  if (raw.supersededBy !== undefined
    && (typeof raw.supersededBy !== 'string' || !raw.supersededBy.trim())) return undefined
  if (lifecycle === 'superseded'
    && (!raw.supersededBy || raw.supersededBy === raw.intentId)) return undefined

  let resolution: NarrativeIntentResolution | undefined
  if (raw.resolution !== undefined) {
    if (!raw.resolution || typeof raw.resolution !== 'object'
      || typeof raw.resolution.progress !== 'number') return undefined
    const parsed = NarrativeIntentResolutionSchema.safeParse(raw.resolution)
    if (!parsed.success || validateIntentResolution(parsed.data, raw.intentId)) return undefined
    resolution = parsed.data
  }
  if (expected === 'active' && resolution && isTerminalIntentStatus(resolution.status)) return undefined
  if (lifecycle === 'terminal' && (!resolution || !isTerminalIntentStatus(resolution.status))) {
    return undefined
  }

  return {
    intentId: raw.intentId,
    branchId: raw.branchId,
    choice: raw.choice,
    createdRound: raw.createdRound,
    updatedRound: raw.updatedRound,
    ...(resolution ? { resolution: structuredClone(resolution) } : {}),
    ...(expected === 'archived' ? { lifecycle } : {}),
    ...(raw.supersededBy ? { supersededBy: raw.supersededBy } : {}),
  }
}

/**
 * 严格恢复 EngineStore 中的兼容投影。任一意图畸形时整包拒绝，调用方可从
 * 已提交叙事历史重建，不能把部分浏览器状态提升为运行事实。
 */
export function normalizeBranchIntentProjection(value: unknown): BranchIntentProjection | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  if (Object.keys(value).some((key) => !BRANCH_INTENT_PROJECTION_KEYS.has(key))) return undefined
  const raw = value as {
    branchIntents?: unknown
    archivedBranchIntents?: unknown
    focusedBranchIntentId?: unknown
  }
  if (!Array.isArray(raw.branchIntents) || !Array.isArray(raw.archivedBranchIntents)) {
    return undefined
  }

  const branchIntents: BranchIntentState[] = []
  for (const candidate of raw.branchIntents) {
    const intent = normalizePersistedBranchIntent(candidate, 'active')
    if (!intent) return undefined
    branchIntents.push(intent)
  }
  const archivedBranchIntents: BranchIntentState[] = []
  for (const candidate of raw.archivedBranchIntents) {
    const intent = normalizePersistedBranchIntent(candidate, 'archived')
    if (!intent) return undefined
    archivedBranchIntents.push(intent)
  }

  const ids = [...branchIntents, ...archivedBranchIntents].map((intent) => intent.intentId)
  if (new Set(ids).size !== ids.length) return undefined
  if (raw.focusedBranchIntentId !== undefined
    && (typeof raw.focusedBranchIntentId !== 'string' || !raw.focusedBranchIntentId.trim())) {
    return undefined
  }
  const requestedFocus = typeof raw.focusedBranchIntentId === 'string'
    ? raw.focusedBranchIntentId
    : undefined
  const focusedBranchIntentId = findFocusedBranchIntent(branchIntents, requestedFocus)
    ? requestedFocus
    : findMostRecentlyUpdatedBranchIntentId(branchIntents)

  return {
    branchIntents,
    archivedBranchIntents,
    ...(focusedBranchIntentId ? { focusedBranchIntentId } : {}),
  }
}

/**
 * 浏览器持久化的分支投影只是运行时缓存，完整叙事历史才是可恢复事实。
 * 只有投影逐项等于历史重建结果时才能恢复，避免格式正确但无来源的幽灵意图
 * 抢占后续 Prompt。
 */
export function isBranchIntentProjectionConsistent(
  projection: BranchIntentProjection,
  reconstructed: BranchIntentProjection,
): boolean {
  const signature = (intent: BranchIntentState): string => JSON.stringify({
    intentId: intent.intentId,
    branchId: intent.branchId,
    choice: intent.choice,
    createdRound: intent.createdRound,
    updatedRound: intent.updatedRound,
    resolution: intent.resolution ?? null,
    lifecycle: intent.lifecycle ?? null,
    supersededBy: intent.supersededBy ?? null,
  })
  const sameCollection = (
    left: readonly BranchIntentState[],
    right: readonly BranchIntentState[],
  ): boolean => {
    if (left.length !== right.length) return false
    const rightById = new Map(right.map((intent) => [intent.intentId, signature(intent)]))
    return left.every((intent) => rightById.get(intent.intentId) === signature(intent))
  }

  return projection.focusedBranchIntentId === reconstructed.focusedBranchIntentId
    && sameCollection(projection.branchIntents, reconstructed.branchIntents)
    && sameCollection(projection.archivedBranchIntents, reconstructed.archivedBranchIntents)
}

export function upsertBranchIntent(
  current: readonly BranchIntentState[],
  branchId: string,
  choice: string,
  round: number,
): BranchIntentCollection {
  const intent = createBranchIntentState(branchId, choice, round)
  const intents = structuredClone(current) as BranchIntentState[]
  const existingIndex = intents.findIndex((entry) => entry.intentId === intent.intentId)
  if (existingIndex >= 0) {
    // 同一分支条目重复确认时不重置已经提交的进度；这类重复点击只重新聚焦原意图。
    return { intents, focusedIntentId: intents[existingIndex].intentId }
  }

  // 另一个分支即使表达相近目标，也可能有不同路径、承诺和既有进度。
  // 新选择只切换焦点，所有非终态意图继续进入后续 Prompt。
  intents.push(intent)
  return { intents, focusedIntentId: intent.intentId }
}

export function isTerminalIntentStatus(
  status: NarrativeIntentResolution['status'],
): boolean {
  return TERMINAL_INTENT_STATUSES.has(status)
}

export function validateIntentResolutionForState(
  intent: BranchIntentState,
  resolution: NarrativeIntentResolution | undefined,
): string | undefined {
  const error = validateIntentResolution(resolution, intent.intentId)
  if (error) return error
  if (intent.resolution && resolution && resolution.progress < intent.resolution.progress) {
    return `progress 不得低于该意图已提交的 ${intent.resolution.progress}`
  }
  return undefined
}

export function validateIntentResolution(
  resolution: NarrativeIntentResolution | undefined,
  expectedIntentId: string,
): string | undefined {
  if (!resolution) return `当前命运意图 ${expectedIntentId} 缺少 intentResolution`
  if (resolution.intentId !== expectedIntentId) {
    return `intentResolution.intentId 必须为 ${expectedIntentId}`
  }
  if (resolution.status === 'succeeded' && resolution.progress !== 100) {
    return 'status=succeeded 时 progress 必须为 100'
  }
  if (resolution.status === 'progressing' && resolution.progress >= 100) {
    return 'status=progressing 时 progress 必须小于 100；达到 100 应提交 succeeded'
  }
  if (resolution.status === 'partially_succeeded'
    && (resolution.progress <= 0 || resolution.progress >= 100)) {
    return 'status=partially_succeeded 时 progress 必须大于 0 且小于 100'
  }
  if (resolution.feasibility === 'impossible' && resolution.status !== 'failed') {
    return 'feasibility=impossible 时 status 必须为 failed'
  }
  if (resolution.status === 'blocked'
    && resolution.feasibility !== 'blocked'
    && resolution.feasibility !== 'conditional') {
    return 'status=blocked 时 feasibility 必须为 blocked 或 conditional'
  }
  if (resolution.status === 'progressing' && resolution.feasibility === 'impossible') {
    return 'status=progressing 时 feasibility 不能为 impossible'
  }
  if (!isTerminalIntentStatus(resolution.status) && !resolution.nextStep?.trim()) {
    return `status=${resolution.status} 时必须提供 nextStep`
  }
  return undefined
}

export function commitBranchIntentResolution(
  current: readonly BranchIntentState[],
  focusedIntentId: string | undefined,
  resolution: NarrativeIntentResolution,
  round: number,
): BranchIntentCommitResult {
  const intents = structuredClone(current) as BranchIntentState[]
  const intent = findFocusedBranchIntent(intents, focusedIntentId)
  if (!intent) {
    return {
      intents,
      focusedIntentId: findMostRecentlyUpdatedBranchIntentId(intents),
      error: '当前没有可提交结果的聚焦命运意图',
      terminal: false,
    }
  }

  const error = validateIntentResolutionForState(intent, resolution)
  if (error) {
    return { intents, focusedIntentId, error, terminal: false }
  }

  intent.resolution = structuredClone(resolution)
  intent.updatedRound = round
  const terminal = isTerminalIntentStatus(resolution.status)
  const archivedIntents = terminal
    ? [{ ...intent, resolution: structuredClone(resolution), updatedRound: round, lifecycle: 'terminal' as const }]
    : undefined
  const remaining = terminal
    ? intents.filter((entry) => entry.intentId !== intent.intentId)
    : intents

  return {
    intents: remaining,
    focusedIntentId: terminal
      ? findMostRecentlyUpdatedBranchIntentId(remaining)
      : intent.intentId,
    ...(archivedIntents ? { archivedIntents } : {}),
    committed: structuredClone(resolution),
    terminal,
  }
}

/**
 * 从完整叙事历史重建活动与归档意图。
 *
 * 浏览器持久化只保存已经提交的分支选择和结构化判定；重建过程不从正文
 * 猜测意图，也不会把畸形或找不到来源分支的判定提升为事实。
 */
export function rebuildBranchIntentsFromHistory(
  history: readonly BranchIntentHistoryEntry[],
): BranchIntentCollection {
  let intents: BranchIntentState[] = []
  let archivedIntents: BranchIntentState[] = []
  let focusedIntentId: string | undefined

  history.forEach((entry, index) => {
    const round = Number.isInteger(entry.round) && (entry.round ?? 0) >= 0
      ? entry.round as number
      : index + 1
    const entryId = typeof entry.id === 'string' ? entry.id.trim() : ''
    const choice = typeof entry.resolvedChoice === 'string' ? entry.resolvedChoice.trim() : ''
    if (entryId && choice) {
      const choiceRound = Number.isInteger(entry.resolvedChoiceRound)
        && (entry.resolvedChoiceRound ?? -1) >= 0
        ? entry.resolvedChoiceRound as number
        : round
      const next = upsertBranchIntent(intents, entryId, choice, choiceRound)
      intents = next.intents
      focusedIntentId = next.focusedIntentId
      if (next.archivedIntents?.length) {
        archivedIntents = [...archivedIntents, ...next.archivedIntents]
      }
    }

    if (!entry.intentResolution || typeof entry.intentResolution !== 'object'
      || typeof entry.intentResolution.progress !== 'number') return
    const parsedResolution = NarrativeIntentResolutionSchema.safeParse(entry.intentResolution)
    if (!parsedResolution.success) return
    const resolution = parsedResolution.data
    if (!intents.some((intent) => intent.intentId === resolution.intentId)) return
    const committed = commitBranchIntentResolution(
      intents,
      resolution.intentId,
      resolution,
      round,
    )
    if (committed.error || !committed.committed) return
    intents = committed.intents
    focusedIntentId = committed.focusedIntentId
    if (committed.archivedIntents?.length) {
      archivedIntents = [...archivedIntents, ...committed.archivedIntents]
    }
  })

  return {
    intents,
    focusedIntentId: findFocusedBranchIntent(intents, focusedIntentId)
      ? focusedIntentId
      : findMostRecentlyUpdatedBranchIntentId(intents),
    ...(archivedIntents.length > 0 ? { archivedIntents } : {}),
  }
}

function serializeIntent(intent: BranchIntentState): Record<string, unknown> {
  return {
    意图编号: toNarrativeAIIntentId(intent.intentId),
    分支编号: intent.branchId,
    玩家选择: intent.choice,
    建立轮次: intent.createdRound,
    更新轮次: intent.updatedRound,
    上次判定: translateInternalIntentResolutionToAI(intent.resolution),
  }
}

function appendOtherActiveIntents(
  lines: string[],
  otherActive: readonly BranchIntentState[],
): void {
  if (otherActive.length === 0) return
  lines.push(
    '【其他未完成命运意图；保持事实连续，不得静默删除】',
    JSON.stringify(otherActive.map(serializeIntent)),
    '其他意图只作背景牵引；除非最终叙事确实触及，不得擅自宣告其成功、失败或放弃。',
  )
}

/**
 * 第一次叙事调用只接收玩家原始意图数据；如何裁决由固定叙事规则负责。
 * 这里不拼接自然语言指令，避免把玩家内容和系统约束混成同一段文本。
 */
export function buildNarrativeBranchIntentProjection(
  focused: BranchIntentState,
  otherActive: readonly BranchIntentState[],
): Record<string, unknown> {
  return {
    当前意图: serializeIntent(focused),
    ...(otherActive.length > 0
      ? { 其他未完成意图: otherActive.map(serializeIntent) }
      : {}),
  }
}

export function buildSettlementBranchIntentInstruction(
  focused: BranchIntentState,
  otherActive: readonly BranchIntentState[],
): string {
  const lines = [
    '【当前命运意图结算条件】',
    JSON.stringify(serializeIntent(focused)),
    '只按最终叙事已经写成的实际执行结果结算，不续写、不改写，也不重新判断该方向本应如何发展。',
    `“命运意图判定”必须存在，意图编号必须严格等于 ${toNarrativeAIIntentId(focused.intentId)}；按数据契约完整返回全部必需字段。`,
    `可行性只能为${AI_INTENT_FEASIBILITIES.aiValues.join('、')}；执行方式只能为${AI_INTENT_EXECUTION_MODES.aiValues.join('、')}；状态只能为${AI_INTENT_STATUSES.aiValues.join('、')}；风险等级只能为${AI_INTENT_RISK_LEVELS.aiValues.join('、')}。`,
  ]
  appendOtherActiveIntents(lines, otherActive)
  return lines.join('\n')
}
