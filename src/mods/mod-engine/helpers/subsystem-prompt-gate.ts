/**
 * @module subsystem-prompt-gate.ts
 * @description 叙事 Prompt 注入门控 —— 空 summary / 噪声过滤 / 分层状态卡 / 去重
 * @mod mod-engine
 */

import type { ModManifest, RoundContext, SubSystemState } from '@/foundation'

import {
  isMvpSystemInstructionSubsystem,
  isMvpPromptSubsystem,
  MVP_MACRO_IMPACT_SUBSYSTEM_IDS,
} from './mvp-runtime-policy'

/** memorySummary【当前状态】三层 */
export type PromptStateLayer = 'personal' | 'local' | 'world'

const LAYER_HEADERS: Record<PromptStateLayer, string> = {
  personal: '【主角即时】',
  local: '【本地环境】',
  world: '【世界背景】',
}

/** 主角即时：属性、生存、职业、关系、背包等 */
const PERSONAL_LAYER_IDS = new Set([
  'character-base',
  'health',
  'lifespan',
  'lifecycle-system',
  'morality',
  'luck',
  'faith',
  'education',
  'work',
  'settlement',
  'item',
  'growth-system',
  'destiny-pattern',
  'works',
  'achievement',
  'combat-power',
  'cultivation',
  'fortune-encounter',
  'reputation',
  'culture',
  'art',
  'npc-system',
  'relationship-system',
])

/** 本地环境：所在区域、气候、法律、生态、资源等 */
const LOCAL_LAYER_IDS = new Set([
  'climate',
  'pollution',
  'natural-resource',
  'ecology',
  'geography',
  'legal',
  'social-stratification',
  'monster',
  'economy',
  'population',
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

/** 叙事回合禁止 AI 直接写入 enabled 开关的子系统 */
const NO_AI_ENABLED_TOGGLE = new Set([
  'cultivation',
  'monster',
  'anomaly-phenomena',
  'divine-intervention',
  'divine-creation',
])

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

export interface ActivePromptModBinding {
  readonly mod: string
}

/**
 * 只聚合真正参与当前运行链的 MOD 规则。
 * manifest 被加载仅代表代码可用，不代表其规则应进入本轮叙事 Prompt。
 */
export function collectActiveModWorldRules(
  manifests: readonly ModManifest[],
  activeBindings: Iterable<ActivePromptModBinding>,
): string | undefined {
  const activeModNames = new Set<string>(['mod-engine'])
  for (const binding of activeBindings) {
    const modName = binding.mod.trim()
    if (modName) activeModNames.add(modName)
  }

  const seenRules = new Set<string>()
  const rules: string[] = []
  for (const manifest of manifests) {
    if (!activeModNames.has(manifest.name)) continue
    const rule = manifest.worldRules?.trim()
    if (!rule || seenRules.has(rule)) continue
    seenRules.add(rule)
    rules.push(rule)
  }

  return rules.length > 0 ? rules.join('\n') : undefined
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

/** System-instruction commit gate: inactive systems reject writes. */
export function getSystemInstructionBlockReason(
  subsystemId: string,
  changes: Record<string, unknown>,
  context: RoundContext,
): string | null {
  if (!isMvpSystemInstructionSubsystem(subsystemId)) {
    return `子系统 "${subsystemId}" 不在当前 MVP 系统指令白名单，拒绝提交`
  }

  const state = context.subsystemStates[subsystemId]
  if (state && !isSubsystemOpenForPrompt(state, subsystemId)) {
    return `子系统 "${subsystemId}" 在本局未启用或未就绪，拒绝系统指令`
  }

  if (NO_AI_ENABLED_TOGGLE.has(subsystemId) && typeof changes.enabled !== 'undefined') {
    return `子系统 "${subsystemId}" 的 enabled 不可由叙事 AI 修改`
  }

  return null
}

/** 叙事一致性头（自然语言，非 tag 正则切换） */
export function buildNarrativeCoherenceHeader(
  config: Record<string, unknown>,
): string | undefined {
  const parts: string[] = ['【叙事一致性】']
  parts.push('世界基调以同条消息“世界设定”中的世界描述为准，禁止在此重复展开世界观全文。')
  const powerFramework = config.powerFramework as { enabled?: boolean; label?: string } | undefined
  if (!powerFramework?.enabled) {
    parts.push('基础力量体系为“无”；超常内容只采用【世界设定】【命格天赋】或【当前状态】已经明确成立的事实。')
  } else {
    parts.push(`力量体系：${powerFramework.label ?? '按世界设定运行'}；仅使用【当前状态】中已出现的能力与设定。`)
  }
  return parts.join('\n')
}

export function getMacroImpactBlockReason(
  subsystemId: string,
  changes: Record<string, unknown>,
  context: RoundContext,
): string | null {
  if (!MVP_MACRO_IMPACT_SUBSYSTEM_IDS.has(subsystemId)) {
    return `子系统 "${subsystemId}" 不在宏观影响白名单，拒绝提交`
  }
  const state = context.subsystemStates[subsystemId]
  if (!state || !isSubsystemOpenForPrompt(state, subsystemId)) {
    return `子系统 "${subsystemId}" 在本局未启用或未就绪，拒绝宏观影响`
  }
  if (typeof changes.enabled !== 'undefined') {
    return `子系统 "${subsystemId}" 的 enabled 不可由宏观影响 AI 修改`
  }
  return null
}

/** 世界规则只保留 tag 兜底；校准摘要已有独立字段，避免稳定 Prompt 重复发送。 */
export function buildNarrativeWorldRules(fallbackFromTag: string): string {
  return fallbackFromTag.trim()
}
