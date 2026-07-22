/**
 * @module branch-intent-resolution.ts
 * @description 命运选择意图的持久化状态、结构化结果校验与 Prompt 注入
 * @mod mod-engine
 */

import type { NarrativeIntentResolution } from './narrative-semantic-signals'
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
}

export interface BranchIntentCollection {
  intents: BranchIntentState[]
  focusedIntentId?: string
}

export interface BranchIntentCommitResult extends BranchIntentCollection {
  committed?: NarrativeIntentResolution
  error?: string
  terminal: boolean
}

const TERMINAL_INTENT_STATUSES = new Set<NarrativeIntentResolution['status']>([
  'succeeded',
  'partially_succeeded',
  'failed',
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
    intents[existingIndex] = intent
  } else {
    intents.push(intent)
  }
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
  return validateIntentResolution(resolution, intent.intentId)
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
  const remaining = terminal
    ? intents.filter((entry) => entry.intentId !== intent.intentId)
    : intents

  return {
    intents: remaining,
    focusedIntentId: terminal
      ? findMostRecentlyUpdatedBranchIntentId(remaining)
      : intent.intentId,
    committed: structuredClone(resolution),
    terminal,
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

export function buildBranchIntentInstruction(
  focused: BranchIntentState,
  otherActive: readonly BranchIntentState[],
): string {
  const lines = [
    '【当前唯一主线；本轮必须按玩家选择推进】',
    JSON.stringify(serializeIntent(focused)),
    '玩家选择是本轮唯一主线。正文必须让该选择发生具体行动、可见回应和阶段性后果；不得改写成其他目标，不得只写等待或把选择留到未来。',
    '玩家选择表达行动、立场或长期方向，不保证结果。结合世界规则、角色能力、资源、关系、阻力、运气与本轮时间跨度评估结果，再写正文。',
    `“命运意图判定”必须存在，意图编号必须严格等于 ${toNarrativeAIIntentId(focused.intentId)}；完整返回可行性、执行方式、状态、风险等级、进度、阻碍、前置条件、代价、预计耗时、判定理由与下一步。`,
    `可行性只能为${AI_INTENT_FEASIBILITIES.aiValues.join('、')}；执行方式只能为${AI_INTENT_EXECUTION_MODES.aiValues.join('、')}；状态只能为${AI_INTENT_STATUSES.aiValues.join('、')}；风险等级只能为${AI_INTENT_RISK_LEVELS.aiValues.join('、')}。`,
    '小型行动本轮完成；中大型目标本轮必须推进一个明确阶段，并给出当前阻碍、代价和下一步。失败必须产生可信后果，受阻必须说明解除条件，不得因为玩家点击选项就直接保证成功。',
  ]

  if (otherActive.length > 0) {
    lines.push(
      '【其他未完成命运意图；保持事实连续，不得静默删除】',
      JSON.stringify(otherActive.map(serializeIntent)),
      '其他意图只作背景牵引，不能抢走本轮主线；除非正文确实触及，不得擅自宣告其成功、失败或放弃。',
    )
  }

  return lines.join('\n')
}
