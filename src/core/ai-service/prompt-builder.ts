/**
 * Purpose: Assemble the three dynamic user messages for the main narrative call.
 * Owner: core:ai-service
 * Responsibility: Serialize only the approved 01 story-AI fields in sample order.
 */

import type { PromptContext, PromptTemplate } from '@/foundation'

export type PromptSegmentStrategy = 'S4'

export interface PromptSegments {
  stablePrefixChars: number
  full: string
  globalSegmentChars: number
  userSegments: [string, string, string]
  userMessageCount: 3
  strategy: PromptSegmentStrategy
  memorySegmentChars: number
  roundSegmentChars: number
  totalChars: number
}

const DEFAULT_PLAYER_ACTION = '在当前条件下自然推进故事。'

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

function buildCurrentTimeInstruction(value: string | undefined, supplemental?: string): string {
  const time = nonEmpty(value) ?? '当前时间'
  const instruction = `时间窗口：${time}。请在这个时间范围内生成一段合理的故事。`
  const extra = nonEmpty(supplemental)
  return extra
    ? `${instruction}\n本轮时间参考：${extra}`
    : instruction
}

function buildPlayerActionInstruction(intent: Record<string, unknown> | undefined): string {
  const action = nonEmpty(intent?.本轮明确行动) ?? DEFAULT_PLAYER_ACTION
  return `玩家行动：${action}`
}

function buildAgeCapabilityInstruction(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value)
  const age = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
  return `年龄边界：角色当前${age}岁；行动须符合其年龄、身体、知识、身份和已经成立的经历。超出能力的行动不得直接视为已完成。`
}

function buildNarrativeStyleInstruction(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? `叙述风格：${value}`
    : undefined
}

function buildNarrativeAddressingInstruction(
  value: PromptContext['narrativeAddressing'],
  characterName: unknown,
): string {
  if (value === 'first-person') {
    return '称呼方式：涉及主角时使用第一人称“我”指代主角；这只是称呼方式，不规定叙事主语。'
  }
  if (value === 'character-name') {
    const name = nonEmpty(characterName)
    if (name) {
      return `称呼方式：涉及主角时使用角色姓名“${name}”指代主角；这只是称呼方式，不规定叙事主语。`
    }
  }
  return '称呼方式：涉及主角时使用第二人称“你”指代主角；这只是称呼方式，不规定叙事主语。'
}

function buildWordCountInstruction(value: string | undefined): string {
  const instruction = nonEmpty(value)
  if (instruction) {
    const normalized = instruction.replace(/正文约\s*(\d+)\s*字/u, '正文约$1字')
    return `字数要求：${/[。！？!?]$/u.test(normalized) ? normalized : `${normalized}。`}`
  }
  return '字数要求：正文约300字。'
}

function buildEventInjectionInstruction(value: string | undefined): string | undefined {
  const event = nonEmpty(value)
  return event
    ? `本轮事件材料：${event}\n这些材料作为本轮事实参考；正文未写出的内容不进入后续状态提取。`
    : undefined
}

/** PromptContext 转为固定键序且字段白名单化的 01 输入。 */
export function buildNarrativeUserJson(context: PromptContext): Record<string, unknown> {
  const rawWorld = context.worldNarrativeView
  const world = {
    名称: nonEmpty(rawWorld.名称) ?? '',
    描述: nonEmpty(rawWorld.描述) ?? '',
  }
  const rawCharacter = context.characterProfileView
  const currentAge = context.characterStatusView.年龄
  const playerBranchIntent = context.playerBranchIntent
    ? structuredClone(context.playerBranchIntent)
    : undefined
  const eventInjection = buildEventInjectionInstruction(context.eventInjectionText)
  const narrativeStyle = buildNarrativeStyleInstruction(context.narrativeStyle)
  const character = {
    姓名: nonEmpty(rawCharacter.姓名) ?? '',
    性别: nonEmpty(rawCharacter.性别) ?? '未设定',
    种族: nonEmpty(rawCharacter.种族) ?? '未设定',
    背景: nonEmpty(rawCharacter.背景) ?? '',
    ...(typeof currentAge === 'number' ? { 当前年龄: currentAge } : {}),
    基础属性: rawCharacter.基础属性 ?? {},
    天赋: context.talents ?? [],
  }
  const roundFactsAndDirection = [
    buildCurrentTimeInstruction(context.currentTime, context.timeGuideText),
    buildPlayerActionInstruction(playerBranchIntent),
    ...(eventInjection ? [eventInjection] : []),
    buildAgeCapabilityInstruction(currentAge),
    buildNarrativeAddressingInstruction(context.narrativeAddressing, rawCharacter.姓名),
    ...(narrativeStyle ? [narrativeStyle] : []),
    buildWordCountInstruction(context.wordCountInstruction),
  ]

  return {
    世界: world,
    历史连续性事实: context.timelineMemory ?? [],
    角色: character,
    本轮事实与方向: roundFactsAndDirection,
    ...(Array.isArray(context.currentDueEvents) && context.currentDueEvents.length > 0
      ? { 当前到期事件: context.currentDueEvents.filter((event): event is string => typeof event === 'string' && event.trim().length > 0) }
      : {}),
  }
}

/** 输出三条独立 user 消息；顺序严格为世界、连续性事实与角色、本轮事实与方向。 */
export function buildSegmentedPrompt(
  _template: PromptTemplate,
  context: PromptContext,
): PromptSegments {
  const input = buildNarrativeUserJson(context)
  const globalSegment = JSON.stringify({ 世界: input.世界 ?? {} })
  const memorySegment = JSON.stringify({
    历史连续性事实: input.历史连续性事实 ?? [],
    角色: input.角色 ?? {},
  })
  const roundSegment = JSON.stringify({
    本轮事实与方向: input.本轮事实与方向 ?? [],
    ...(Array.isArray(input.当前到期事件) && input.当前到期事件.length > 0
      ? { 当前到期事件: input.当前到期事件 }
      : {}),
  })

  return {
    stablePrefixChars: globalSegment.length,
    full: [globalSegment, memorySegment, roundSegment].join('\n'),
    globalSegmentChars: globalSegment.length,
    userSegments: [globalSegment, memorySegment, roundSegment],
    userMessageCount: 3,
    strategy: 'S4',
    memorySegmentChars: memorySegment.length,
    roundSegmentChars: roundSegment.length,
    totalChars: globalSegment.length + memorySegment.length + roundSegment.length + 2,
  }
}
