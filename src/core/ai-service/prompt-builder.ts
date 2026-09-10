/**
 * Purpose: Assemble the current data-layer payload for the main narrative call.
 * Owner: core:ai-service
 * Responsibility: Serialize the world, player, history, attributes, and current-round data contract.
 */

import type { PromptContext, PromptTemplate } from '@/foundation'
import { compileNarrativeGuidance } from './narrative-guidance-compiler'

export type PromptSegmentStrategy = 'S4'

export interface PromptSegments {
  stablePrefixChars: number
  full: string
  globalSegmentChars: number
  userSegments: string[]
  userMessageCount: number
  strategy: PromptSegmentStrategy
  memorySegmentChars: number
  roundSegmentChars: number
  totalChars: number
}

const DEFAULT_PLAYER_ACTION = '在当前条件下自然推进故事。'

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

function integerString(value: unknown): string | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? String(Math.trunc(numeric)) : undefined
}

function buildNarrativeAttributes(value: unknown): Record<'心智' | '体魄' | '魅力' | '家境', string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { 心智: '0', 体魄: '0', 魅力: '0', 家境: '0' }
  }
  const source = value as Record<string, unknown>
  const numericSet = source.当前数值 && typeof source.当前数值 === 'object' && !Array.isArray(source.当前数值)
    ? source.当前数值 as Record<string, unknown>
    : source
  return {
    心智: integerString(numericSet.mind ?? numericSet.心智) ?? '0',
    体魄: integerString(numericSet.physique ?? numericSet.体魄) ?? '0',
    魅力: integerString(numericSet.charisma ?? numericSet.魅力) ?? '0',
    家境: '0',
  }
}

function buildHistoryTexts(context: PromptContext): {
  longTerm: string[]
  recent: string[]
} {
  const longTerm = (context.timelineMemory ?? [])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
  const recent = (context.recentStories ?? [])
    .filter((story): story is string => typeof story === 'string' && story.trim().length > 0)
    .map((story) => story.trim())
  return { longTerm, recent }
}

/** PromptContext 转为当前数据层示例的固定键序结构。 */
export function buildNarrativeUserJson(context: PromptContext): unknown {
  const rawWorld = context.worldNarrativeView
  const world = {
    名称: nonEmpty(rawWorld.名称) ?? '',
    描述: nonEmpty(rawWorld.描述) ?? '',
  }
  const rawCharacter = context.characterProfileView
  const currentAge = context.characterStatusView.年龄
  const guidance = compileNarrativeGuidance(context)
  const playerBranchIntent = guidance.playerBranchIntent
  const character = {
    姓名: nonEmpty(rawCharacter.姓名) ?? '',
    性别: nonEmpty(rawCharacter.性别) ?? '未设定',
    种族: nonEmpty(rawCharacter.种族) ?? '未设定',
    背景: nonEmpty(rawCharacter.背景) ?? '',
    天赋技能: (context.talents ?? []).map((talent) => `${talent.名称}：${talent.效果}`),
  }
  const history = buildHistoryTexts(context)
  const currentAgeNumeric = Number(currentAge)
  const currentAgeValue = Number.isFinite(currentAgeNumeric) ? Math.max(0, Math.floor(currentAgeNumeric)) : 0
  const currentTime = nonEmpty(context.currentTime) ?? '当前时间'
  const action = [
    nonEmpty(playerBranchIntent?.本轮明确行动) ?? DEFAULT_PLAYER_ACTION,
    ...(guidance.systemGuidance ?? []),
    nonEmpty(context.timeGuideText),
    nonEmpty(context.eventInjectionText),
    nonEmpty(context.eventLibraryText),
    ...(context.currentDueEvents ?? []).map((event) => nonEmpty(event)),
  ].filter((item): item is string => Boolean(item)).join('\n')
  const attributes = buildNarrativeAttributes(
    context.characterStatusView.属性数值 ?? rawCharacter.基础属性,
  )
  return [
    { 世界: world },
    { 玩家信息: character },
    {
      剧情: {
        长期记忆: history.longTerm,
        近期记忆: history.recent,
      },
    },
    {
      玩家属性: attributes,
      当前信息: {
        时间: `${currentAgeValue}岁-${currentTime}`,
        命运抉择: action,
      },
    },
  ]
}

/** 输出单条数据层 JSON 消息，顺序与数据层示例一致。 */
export function buildSegmentedPrompt(
  _template: PromptTemplate,
  context: PromptContext,
): PromptSegments {
  const input = buildNarrativeUserJson(context)
  const dataLayerSegment = JSON.stringify(input)
  const segments = [dataLayerSegment]

  return {
    stablePrefixChars: dataLayerSegment.length,
    full: segments.join('\n'),
    globalSegmentChars: dataLayerSegment.length,
    userSegments: segments,
    userMessageCount: segments.length,
    strategy: 'S4',
    memorySegmentChars: dataLayerSegment.length,
    roundSegmentChars: dataLayerSegment.length,
    totalChars: dataLayerSegment.length,
  }
}
