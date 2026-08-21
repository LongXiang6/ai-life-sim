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

const DEFAULT_PLAYER_ACTION = '在当前条件下顺其自然，处理本轮生活中实际发生的事情。'
const DEFAULT_NARRATIVE_STYLE = '保留古典用词质感，但使用略微白话、直接易读的句式；以具体动作、工具、材料、身体限制、关系反应和可追踪因果推进，不堆砌典故、意象、倒装或晦涩表达；时间、年龄与季节在人物、环境、关系和行动的变化中自然体现，不要机械用日期或年龄句开头。'

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

function buildCurrentTimeInstruction(value: string | undefined): string {
  const time = nonEmpty(value) ?? '当前时间'
  const scope = /日$/u.test(time)
    ? '本日'
    : /月$/u.test(time)
      ? '本月'
      : /季|春|夏|秋|冬/u.test(time)
        ? '本季度'
        : '本年'
  return `${time}，请合理模拟${scope}发生的事情。`
}

function buildPlayerActionInstruction(intent: Record<string, unknown> | undefined): string {
  const action = nonEmpty(intent?.本轮明确行动) ?? DEFAULT_PLAYER_ACTION
  return `玩家行动：${action}`
}

function buildAgeCapabilityInstruction(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value)
  const age = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
  if (age === 0) {
    return '年龄边界：角色当前0岁，只能表现新生儿的睡眠、进食、哭闹、抓握、感官反应和被照料过程；不能独立移动、学习技能、使用工具、工作或作出决定，本轮行动与选择由照料者和环境承载。'
  }
  if (age === 1) {
    return '年龄边界：角色当前1岁，只能在照料下感知、哭闹、抓握、爬行或扶物蹒跚；不能稳稳独立行走、学习或执行技能、使用工具、工作、持械、帮助完成成人任务或作出成人式决定，本轮事件与选择由照料者、监护人和环境承载。'
  }
  if (age === 2) {
    return '年龄边界：角色当前2岁，只能进行幼儿能够成立的简单言语、游戏、模仿和依赖性活动；不能从事工作、接受正式技能训练、独立使用危险工具或作出成人式决定，关键行动由照料者和环境承载。'
  }
  if (age <= 5) {
    return `年龄边界：角色当前${age}岁，只能进行幼儿能够成立的游戏、简单学习、模仿和有限自理；不能承担工作、危险工具、持械任务或成人责任，关键决定由照料者、监护人或环境承载。`
  }
  if (age <= 11) {
    return `年龄边界：角色当前${age}岁，可以学习、探索和做安全的简单帮忙，但不能直接拥有成人职业熟练度、独立承担危险劳动、持械任务或重大社会责任。`
  }
  if (age <= 15) {
    return `年龄边界：角色当前${age}岁，可以在指导下训练、学习和承担逐步增加的责任，但不能因背景、天赋或玩家指令直接具备未经长期积累的成人专业能力。`
  }
  return `年龄边界：角色当前${age}岁，行动仍须符合已经成立的身体、知识、身份、长期积累和处境；背景、天赋或玩家指令不能把尚未获得的能力直接写成既成事实。`
}

function buildNarrativeStyleInstruction(value: string | undefined): string {
  const style = nonEmpty(value)
  const normalized = style?.replace(/^【[^】]+】/u, '').trim()
  const usesLegacyDefault = !normalized
    || normalized.includes('根据世界事实、人生阶段和时间跨度选择合理剧情材料')
  return `叙述风格：${usesLegacyDefault ? DEFAULT_NARRATIVE_STYLE : `${normalized}；时间、年龄与季节在人物、环境、关系和行动的变化中自然体现，不要机械用日期或年龄句开头。`}`
}

function buildNarrativeAddressingInstruction(
  value: PromptContext['narrativeAddressing'],
  characterName: unknown,
): string {
  if (value === 'first-person') {
    return '称呼方式：本轮正文以第一人称“我”作为当前角色的叙事主语，保持视角一致；不要把“你”或角色姓名作为当前角色的叙事主语。'
  }
  if (value === 'character-name') {
    const name = nonEmpty(characterName)
    if (name) {
      return `称呼方式：本轮正文以当前角色姓名“${name}”作为叙事主语，保持称呼自然一致；不要在当前角色叙事中改用“你”或“我”作为主语。`
    }
  }
  return '称呼方式：本轮正文以第二人称“你”作为当前角色的叙事主语，保持视角一致；角色姓名只用于直接称呼或必要消歧。'
}

function buildWordCountInstruction(value: string | undefined): string {
  const match = nonEmpty(value)?.match(/正文约\s*(\d+)\s*字/u)
  return `字数要求：正文约${match?.[1] ?? '300'}字。`
}

function buildWorldRules(context: PromptContext): string[] {
  return [context.worldRules, context.modWorldRules]
    .flatMap((value) => nonEmpty(value)?.split(/\r?\n/u) ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
}

/** PromptContext 转为固定键序且字段白名单化的 01 输入。 */
export function buildNarrativeUserJson(context: PromptContext): Record<string, unknown> {
  const rawWorld = context.worldNarrativeView
  const rules = buildWorldRules(context)
  const world = {
    名称: nonEmpty(rawWorld.名称) ?? '',
    描述: nonEmpty(rawWorld.描述) ?? '',
    ...(nonEmpty(rawWorld.空间形态) ? { 空间形态: nonEmpty(rawWorld.空间形态) } : {}),
    ...(nonEmpty(rawWorld.世界观本质) ? { 世界观本质: nonEmpty(rawWorld.世界观本质) } : {}),
    ...(context.powerFramework ? { 力量体系: context.powerFramework } : {}),
    ...(rules.length > 0 ? { 成立规则: rules } : {}),
  }
  const rawCharacter = context.characterProfileView
  const currentAge = context.characterStatusView.年龄
  const character = {
    姓名: nonEmpty(rawCharacter.姓名) ?? '',
    性别: nonEmpty(rawCharacter.性别) ?? '未设定',
    种族: nonEmpty(rawCharacter.种族) ?? '未设定',
    背景: nonEmpty(rawCharacter.背景) ?? '',
    ...(typeof currentAge === 'number' ? { 当前年龄: currentAge } : {}),
    基础属性: rawCharacter.基础属性 ?? {},
    天赋: context.talents ?? [],
  }
  const roundGuidance = [
    buildCurrentTimeInstruction(context.currentTime),
    buildPlayerActionInstruction(context.playerBranchIntent),
    `${buildAgeCapabilityInstruction(currentAge)} 故事保持合理挑战，合理接受玩家行动；若决策不合理、忽视风险或与故事逻辑相悖，则行动很可能失败，并引发可预见的负面连锁反应。剧情走向由决策的合理性决定。`,
    buildNarrativeAddressingInstruction(context.narrativeAddressing, rawCharacter.姓名),
    buildNarrativeStyleInstruction(context.narrativeStyle),
    buildWordCountInstruction(context.wordCountInstruction),
  ]

  return {
    世界: world,
    历史剧情: context.timelineMemory ?? [],
    最近两轮详细剧情: context.recentDetailedStories ?? [],
    角色: character,
    本轮引导: roundGuidance,
    ...(Array.isArray(context.currentDueEvents) && context.currentDueEvents.length > 0
      ? { 当前到期事件: context.currentDueEvents.filter((event): event is string => typeof event === 'string' && event.trim().length > 0) }
      : {}),
  }
}

/** 输出三条独立 user 消息；顺序严格为世界、历史与角色、本轮引导。 */
export function buildSegmentedPrompt(
  _template: PromptTemplate,
  context: PromptContext,
): PromptSegments {
  const input = buildNarrativeUserJson(context)
  const globalSegment = JSON.stringify({ 世界: input.世界 ?? {} })
  const memorySegment = JSON.stringify({
    历史剧情: input.历史剧情 ?? [],
    最近两轮详细剧情: input.最近两轮详细剧情 ?? [],
    角色: input.角色 ?? {},
  })
  const roundSegment = JSON.stringify({
    本轮引导: input.本轮引导 ?? [],
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
