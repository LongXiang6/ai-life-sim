/**
 * Purpose: Assemble the main-narrative data-layer payload.
 * Owner: core:ai-service
 * Responsibility: Preserve the five fields from D:/AI/docs/数据层示例.txt.
 */

import type { PromptContext, PromptTemplate } from '@/foundation'

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

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

function integerString(value: unknown): string | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? String(Math.trunc(numeric)) : undefined
}

function buildNarrativeAttributes(value: unknown): Record<'心智' | '体魄' | '魅力' | '财富', string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { 心智: '0', 体魄: '0', 魅力: '0', 财富: '0' }
  }
  const source = value as Record<string, unknown>
  const numericSet = source.当前数值 && typeof source.当前数值 === 'object' && !Array.isArray(source.当前数值)
    ? source.当前数值 as Record<string, unknown>
    : source
  return {
    心智: integerString(numericSet.mind ?? numericSet.心智) ?? '0',
    体魄: integerString(numericSet.physique ?? numericSet.体魄) ?? '0',
    魅力: integerString(numericSet.charisma ?? numericSet.魅力) ?? '0',
    财富: integerString(numericSet.familyBackground ?? numericSet.财富) ?? '0',
  }
}

function buildHistoricalEvents(context: PromptContext): string[] {
  const timeline = (context.timelineMemory ?? [])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
  const recent = (context.recentStories ?? [])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
  return [...timeline, ...recent]
}

/** PromptContext 转为数据层示例声明的五元素数组。 */
export function buildNarrativeUserJson(context: PromptContext): unknown {
  const rawWorld = context.worldNarrativeView
  const world = {
    名称: nonEmpty(rawWorld.名称) ?? '',
    描述: nonEmpty(rawWorld.描述) ?? '',
  }
  const rawCharacter = context.characterProfileView
  const currentAge = context.characterStatusView.年龄
  const character = {
    姓名: nonEmpty(rawCharacter.姓名) ?? '',
    性别: nonEmpty(rawCharacter.性别) ?? '未设定',
    种族: nonEmpty(rawCharacter.种族) ?? '未设定',
    背景: nonEmpty(rawCharacter.背景) ?? '',
    天赋技能: (context.talents ?? []).map((talent) => `${talent.名称}：${talent.效果}`),
  }
  const historicalEvents = buildHistoricalEvents(context)
  const currentAgeNumeric = Number(currentAge)
  const currentAgeValue = Number.isFinite(currentAgeNumeric) ? Math.max(0, Math.floor(currentAgeNumeric)) : 0
  const currentTime = nonEmpty(context.currentTime) ?? '当前时间'
  const branch = nonEmpty(context.playerBranchIntent?.命运分支) ?? ''
  return [
    { 世界: world },
    { 玩家信息: character },
    { 历史输出: { 事件: historicalEvents } },
    {
      玩家本次点属性: buildNarrativeAttributes(
        context.characterStatusView.属性数值 ?? rawCharacter.基础属性,
      ),
    },
    {
      本次信息: {
        时间节点: `${currentAgeValue}岁·${currentTime}`,
        命运分支: branch,
        篇幅偏好: nonEmpty(context.wordCountInstruction) ?? '',
      },
    },
  ]
}

/** 输出单条数据层消息；服务端受保护资产将其填入 prompt.txt。 */
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
