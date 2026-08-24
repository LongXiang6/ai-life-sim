/**
 * Purpose: Assemble active subsystem facts into the layered main-narrative Prompt context.
 * Owner: mod-engine
 * Responsibility: Relevance gating, layering, deduplication, and coherence framing only; subsystems retain fact ownership.
 *
 * @module subsystem-prompt-gate.ts
 * @description 叙事 Prompt 注入门控 —— 空 summary / 噪声过滤 / 分层状态卡 / 去重
 * @mod mod-engine
 */

import type { RoundContext, SubSystemState } from '@/foundation'

import { isMvpPromptSubsystem } from './mvp-runtime-policy'

/** memorySummary【当前状态】三层 */
export type PromptStateLayer = 'personal' | 'local' | 'world'

const LAYER_HEADERS: Record<PromptStateLayer, string> = {
  personal: '【主角即时】',
  local: '【本地环境】',
  world: '【世界背景】',
}

/** 主角即时：角色状态、成长与当前力量事实。 */
const PERSONAL_LAYER_IDS = new Set([
  'character-base',
  'growth-system',
  'destiny-pattern',
  'combat-power',
  'cultivation',
])

/** 本地环境：当前区域及其完整的概念性区域概况。 */
const LOCAL_LAYER_IDS = new Set([
  'spatial-graph',
  'context-transition',
])

/** 其余 isRelevant 且开放的子系统默认归入世界背景 */

/** 不应注入 AI 的 summary 片段（未启用、未初始化等） */
const PROMPT_NOISE_MARKERS = [
  '未启用',
  '此世界无',
  '未初始化',
  '尚未初始化',
  '尚未定位',
  '等待定居系统绑定',
  '修炼体系未启用',
  '实体：0 个',
  '0/0 事件已填充',
] as const

export function resolvePromptStateLayer(subsystemId: string): PromptStateLayer {
  if (PERSONAL_LAYER_IDS.has(subsystemId)) return 'personal'
  if (LOCAL_LAYER_IDS.has(subsystemId)) return 'local'
  return 'world'
}

export function isPromptNoiseSummary(summary: string | undefined | null): boolean {
  const text = summary?.trim() ?? ''
  if (!text) return true
  return PROMPT_NOISE_MARKERS.some((m) => text.includes(m))
}

export function isSubsystemDataEnabled(data: unknown): boolean {
  if (!data || typeof data !== 'object') return true
  const record = data as Record<string, unknown>
  if (typeof record.enabled === 'boolean') return record.enabled
  if (record.mode === 'off') return false
  return true
}

/** 子系统是否允许进入叙事状态投影或后台分析状态输入 */
export function isSubsystemOpenForPrompt(state: SubSystemState | undefined, subsystemId = state?.id): boolean {
  if (subsystemId && !isMvpPromptSubsystem(subsystemId)) return false
  if (!state?.summary?.trim()) return false
  if (isPromptNoiseSummary(state.summary)) return false
  if (!isSubsystemDataEnabled(state.data)) return false
  return true
}

function normalizeSummaryLine(summary: string): string {
  return summary.trim()
}

/** 收集已注入 memorySummary 的 summary 文本（供 currentState 去重） */
export function collectMemoryStateSummaries(
  allStates: Record<string, SubSystemState>,
  isRelevant: (id: string, context: RoundContext) => boolean,
  context: RoundContext,
): string[] {
  const lines: string[] = []
  for (const [id, state] of Object.entries(allStates)) {
    if (!isRelevant(id, context)) continue
    if (!isSubsystemOpenForPrompt(state, id)) continue
    lines.push(normalizeSummaryLine(state.summary))
  }
  return lines
}

/**
 * 构建三层【当前状态】文本（P1-5）
 * 顺序：主角即时 → 本地环境 → 世界背景（空层省略）
 */
export function buildLayeredMemoryStateCard(
  allStates: Record<string, SubSystemState>,
  isRelevant: (id: string, context: RoundContext) => boolean,
  context: RoundContext,
): string {
  const buckets: Record<PromptStateLayer, string[]> = {
    personal: [],
    local: [],
    world: [],
  }

  for (const [id, state] of Object.entries(allStates)) {
    if (!isRelevant(id, context)) continue
    if (!isSubsystemOpenForPrompt(state, id)) continue
    const layer = resolvePromptStateLayer(id)
    buckets[layer].push(normalizeSummaryLine(state.summary))
  }

  const parts: string[] = []
  for (const layer of ['personal', 'local', 'world'] as const) {
    if (buckets[layer].length === 0) continue
    parts.push(LAYER_HEADERS[layer])
    parts.push(buckets[layer].join('\n'))
  }

  return parts.join('\n')
}

/** @deprecated 使用 buildLayeredMemoryStateCard */
export function buildMemoryStateCard(
  allStates: Record<string, SubSystemState>,
  isRelevant: (id: string, context: RoundContext) => boolean,
  context: RoundContext,
): string {
  return buildLayeredMemoryStateCard(allStates, isRelevant, context)
}

/** P2-9：currentState 去掉已在 memorySummary 状态卡中出现过的 summary */
export function dedupeSummariesAgainstMemory(
  currentStateSummaries: string[],
  memorySummaries: string[],
): string[] {
  const memorySet = new Set(memorySummaries.map(normalizeSummaryLine))
  return currentStateSummaries
    .map(normalizeSummaryLine)
    .filter((line) => line.length > 0 && !memorySet.has(line))
}
