/**
 * @module prompt-builder.ts
 * @description 主叙事三段动态消息组装器
 * @mod core
 *
 * 固定顺序：全局信息 | 记忆 | 本轮引导。
 */

import type { PromptContext, PromptTemplate } from '@/foundation'

import { compileNarrativeGuidance } from './narrative-guidance-compiler'
import { OMIT_EMPTY_PROMPT_FIELDS } from './prompt-flags'

export type PromptSegmentStrategy = 'S4'

export interface PromptSegments {
  stablePrefixChars: number
  full: string
  userSegments: [string, string, string]
  userMessageCount: 3
  strategy: PromptSegmentStrategy
  memorySegmentChars: number
}

const GLOBAL_JSON_KEYS = [
  '世界设定',
  '世界规则',
  '模组世界规则',
  '世界标签',
  '世界校准',
  '力量体系',
  '命格天赋',
  '角色档案',
  '叙事风格',
  '叙事基调',
] as const

const ROUND_JSON_KEYS = [
  '当前时间',
  '角色现状',
  '当前状态',
  '最近变化',
  '当前情节阶段',
  '本轮可回收伏笔',
  '本轮触发事项',
  '时间跨度摘要',
  '已触发因果',
  '系统引导',
  '玩家自定义分支',
  '字数要求',
] as const

type NarrativeJsonKey =
  | (typeof GLOBAL_JSON_KEYS)[number]
  | (typeof ROUND_JSON_KEYS)[number]

function isEmptyPromptValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function pickJsonKeys(
  object: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const selected: Record<string, unknown> = {}
  for (const key of keys) {
    const value = object[key]
    if (OMIT_EMPTY_PROMPT_FIELDS && isEmptyPromptValue(value)) continue
    selected[key] = value
  }
  return selected
}

/** PromptContext 转为固定键序的三层叙事输入。 */
export function buildNarrativeUserJson(context: PromptContext): Record<string, unknown> {
  const guidance = compileNarrativeGuidance({
    roundSystemGuidanceText: context.roundSystemGuidanceText,
    timeGuideText: context.timeGuideText,
    narrativeGuidanceText: context.narrativeGuidanceText,
    playerBranchIntent: context.playerBranchIntent,
  })
  const raw: Record<NarrativeJsonKey, unknown> = {
    世界规则: context.worldRules,
    模组世界规则: context.modWorldRules,
    世界标签: context.worldTagsText,
    世界校准: context.calibrationSummary,
    世界设定: context.worldNarrativeView,
    力量体系: context.powerCeilingPresets,
    叙事风格: context.narrativeStyle,
    叙事基调: context.narrativeToneHint,
    角色档案: context.characterProfileView,
    命格天赋: context.talents,
    当前时间: context.currentTime,
    角色现状: context.characterStatusView,
    当前状态: context.subsystemSummaries,
    最近变化: context.systemChangeSummary,
    当前情节阶段: context.plotStructureText,
    本轮可回收伏笔: context.foreshadowingText,
    本轮触发事项: context.eventInjectionText,
    时间跨度摘要: context.timeBridgeSummary,
    已触发因果: context.causalChainHint,
    系统引导: guidance.systemGuidance,
    玩家自定义分支: guidance.playerBranchIntent,
    字数要求: context.wordCountInstruction,
  }

  return {
    全局信息: pickJsonKeys(raw, GLOBAL_JSON_KEYS),
    记忆: context.timelineMemory,
    本轮引导: pickJsonKeys(raw, ROUND_JSON_KEYS),
  }
}

/** 输出三条独立 user 消息；稳定全局段始终排在最前。 */
export function buildSegmentedPrompt(
  _template: PromptTemplate,
  context: PromptContext,
): PromptSegments {
  const input = buildNarrativeUserJson(context)
  const globalSegment = `⟦全局信息⟧${JSON.stringify(input.全局信息 ?? {})}`
  const memorySegment = `⟦记忆⟧${typeof input.记忆 === 'string' ? input.记忆 : ''}`
  const roundSegment = `⟦本轮引导⟧${JSON.stringify(input.本轮引导 ?? {})}`

  return {
    stablePrefixChars: globalSegment.length,
    full: [globalSegment, memorySegment, roundSegment].join('\n'),
    userSegments: [globalSegment, memorySegment, roundSegment],
    userMessageCount: 3,
    strategy: 'S4',
    memorySegmentChars: memorySegment.length,
  }
}
