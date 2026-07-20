/**

 * @module prompt-builder.ts

 * @description Prompt 组装器 —— KV Cache 优化 + 完整 narrative 模板

 * @mod core

 *

 * Phase 7 策略：

 *   S1：单条用户消息，内部保持全局→记忆→本轮顺序

 *   S2：两条用户消息，全局 | 记忆+本轮

 *   S3：固定前缀 + 多轮历史对话 + 当前消息

 *   S4（默认）：三条用户消息，全局信息 | 记忆 | 本轮引导

 *

 * 规范来源：mod-specification.md §8 · BLUEPRINT-KV-CACHE-TIMESTEP-PHASE6.md §9

 */



import type { PromptTemplate, PromptContext } from '@/foundation'
import { stringifyPrompt } from '@/foundation'

import {

  KV_MESSAGE_STRATEGY,

  KV_CONVERSATION_WINDOW,

  KV_TWO_USER_SEGMENTS,

  OMIT_EMPTY_PROMPT_FIELDS,

  DEDUP_NARRATIVE_HISTORY,

} from './prompt-flags'

import { buildConversationMessages } from './conversation-messages'

import type { ChatMessage } from './conversation-messages'



/** KV 分段策略 */

export type PromptSegmentStrategy = 'S1' | 'S2' | 'S3' | 'S4' | 'legacy'



/**

 * Prompt 分段结果

 */

export interface PromptSegments {

  /** 稳定前缀字符数（观测用） */

  stablePrefixChars: number

  /** 完整 user JSON（S1 主路径 / 降级 fallback） */

  full: string

  /** 可选：S2/S4 用户消息分层 */

  userSegments?: string[]

  /** S3 多轮 messages */

  messages?: ChatMessage[]

  /** 发送前 user 消息条数（观测用） */

  userMessageCount?: number

  strategy: PromptSegmentStrategy

  /** @deprecated 兼容旧字段 */

  stablePrefix: string

  /** @deprecated 兼容旧字段 */

  variableSuffix: string

  /** 记忆层字符数（观测用） */

  memorySegmentChars?: number

}



/** 三层键序：全局信息 → 记忆 → 本轮引导。每层内部仍按慢到快排序。 */

const GLOBAL_JSON_KEYS = [
  '世界规则',
  '模组世界规则',
  '世界标签',
  '世界校准',
  '世界设定',
  '力量体系',
  '玩家自定义',
  '叙事风格',
  '叙事基调',
  '状态变更指南',
  '篇幅偏好',
  '角色档案',
  '命格天赋',
] as const

const MEMORY_JSON_KEYS = [
  '原创保护',
  '长期记忆',
  '核心记忆',
  '相关往事',
  '近期完整经历',
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
  '玩家与系统指令',
  '本轮导演提示',
] as const



type NarrativeJsonKey =

  | (typeof GLOBAL_JSON_KEYS)[number]

  | (typeof MEMORY_JSON_KEYS)[number]

  | (typeof ROUND_JSON_KEYS)[number]



function isEmptyPromptValue(value: unknown): boolean {

  if (value === null || value === undefined) return true

  if (typeof value === 'string') return value.trim() === ''

  if (Array.isArray(value)) return value.length === 0

  return false

}



function djb2Hash(text: string): string {

  let hash = 5381

  for (let i = 0; i < text.length; i++) {

    hash = ((hash << 5) + hash) ^ text.charCodeAt(i)

  }

  return (hash >>> 0).toString(36)

}



function collectMemoryTextHashes(memorySummary: string): Set<string> {

  const hashes = new Set<string>()

  for (const line of memorySummary.split('\n')) {

    const trimmed = line.trim()

    if (trimmed.length >= 20) {

      hashes.add(djb2Hash(trimmed))

    }

  }

  return hashes

}



/** narrativeHistory 与 memory L0 双轨去重（7C-4） */

function dedupNarrativeHistory(

  narrativeHistory: string[],

  recentNarrativeMemory?: string,

): string[] {

  if (!DEDUP_NARRATIVE_HISTORY) return narrativeHistory



  let history = [...narrativeHistory]



  if (recentNarrativeMemory?.includes('【近期完整经历】')) {

    history = history.slice(-2)

  }



  if (!recentNarrativeMemory?.trim()) return history



  const memoryNorm = recentNarrativeMemory.trim()

  const memoryHashes = collectMemoryTextHashes(memoryNorm)



  return history.filter((text) => {

    const normalized = text.trim()

    if (!normalized) return false



    if (

      normalized.length >= 40

      && memoryNorm.includes(normalized.slice(0, Math.min(120, normalized.length)))

    ) {

      return false

    }



    return !memoryHashes.has(djb2Hash(normalized))

  })

}



function resolveMessageStrategy(): PromptSegmentStrategy {

  if (KV_MESSAGE_STRATEGY === 'S4') return 'S4'

  if (KV_MESSAGE_STRATEGY === 'S3') return 'S3'

  if (KV_MESSAGE_STRATEGY === 'S2' || KV_TWO_USER_SEGMENTS) return 'S2'

  return 'S1'

}

function buildRoundDirectorHint(context: PromptContext): string | undefined {

  const parts = [

    context.timeGuideText,

    context.narrativeGuidanceText,

  ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0)



  // 旧存档和已压缩记忆可能保留历史版本的第三人称原文。它们只承载
  // 已发生的事实，不能成为本轮的文风样本；此项必须放在最后一层
  // 本轮引导的末尾，避免大段历史原文在近因位置覆盖当前叙事契约。
  parts.push(
    '【玩家体验写作裁决】若本轮按年或更长跨度推进，正文仍只选择一个最能承载冲突的代表性现场；三段必须连续承接同一地点、同一目标或同一件正在发生的事。禁止用“春天……秋天……入冬……”或类似逐季年表拼接三个独立日常；跨季只用一句过渡，随后回到同一现场的行动、阻力与后果。',
  )
  parts.push(
    '【本轮正文视角】记忆只用于继承已发生的事实、关系、因果和线索；即使其中使用角色姓名、他/她或第三人称，也不得模仿其人称、措辞或段落结构。仅在“正文”中，全程以第二人称“你”指代玩家角色。',
  )
  return parts.join('\n\n')

}



export interface BuildNarrativeUserJsonOptions {

  /** S3 模式下 history 仅进 assistant role */

  omitNarrativeHistory?: boolean

}



/**

 * PromptContext → narrative-prompt JSON 对象（omit 空值）

 */

export function buildNarrativeUserJson(

  context: PromptContext,

  _options?: BuildNarrativeUserJsonOptions,

): Record<string, unknown> {
  const raw: Record<NarrativeJsonKey, unknown> = {

    世界规则: context.worldRules,
    模组世界规则: context.modWorldRules,
    世界标签: context.worldTagsText,
    世界校准: context.calibrationSummary,
    世界设定: context.worldNarrativeView,
    力量体系: context.powerCeilingPresets,
    玩家自定义: context.worldCustomizeText,
    原创保护: context.creationProtectionText,
    叙事风格: context.narrativeStyle,
    叙事基调: context.narrativeToneHint,
    状态变更指南: context.subsystemGuideText,
    篇幅偏好: context.wordCountInstruction,
    角色档案: context.characterProfileView,
    命格天赋: context.talents,

    长期记忆: context.longTermMemory,
    核心记忆: context.coreMemory,
    相关往事: context.relevantMemory,
    近期完整经历: context.recentNarrativeMemory,

    当前时间: context.currentTime,
    角色现状: context.characterStatusView,
    当前状态: context.subsystemSummaries,
    最近变化: context.systemChangeSummary,
    当前情节阶段: context.plotStructureText,
    本轮可回收伏笔: context.foreshadowingText,
    本轮触发事项: context.eventInjectionText,
    时间跨度摘要: context.timeBridgeSummary,
    已触发因果: context.causalChainHint,
    玩家与系统指令: context.userInstruction,
    本轮导演提示: buildRoundDirectorHint(context),
  }

  return {
    全局信息: pickJsonKeys(raw, GLOBAL_JSON_KEYS),
    记忆: pickJsonKeys(raw, MEMORY_JSON_KEYS),
    本轮引导: pickJsonKeys(raw, ROUND_JSON_KEYS),
  }

}



function jsonToPromptString(obj: Record<string, unknown>): string {

  return stringifyPrompt(obj)

}



function pickJsonKeys(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {

  const out: Record<string, unknown> = {}

  for (const key of keys) {
    const value = obj[key]
    if (OMIT_EMPTY_PROMPT_FIELDS && isEmptyPromptValue(value)) continue
    out[key] = value

  }

  return out

}



/**

 * 组装 KV Cache 优化的分段 Prompt

 */

export function buildSegmentedPrompt(template: PromptTemplate, context: PromptContext): PromptSegments {

  const strategy = resolveMessageStrategy()

  const fullObj = buildNarrativeUserJson(context)

  const full = jsonToPromptString(fullObj)

  const globalInfo = (fullObj.全局信息 ?? {}) as Record<string, unknown>
  const memory = (fullObj.记忆 ?? {}) as Record<string, unknown>
  const roundGuidance = (fullObj.本轮引导 ?? {}) as Record<string, unknown>

  const globalStr = jsonToPromptString({ 全局信息: globalInfo })
  const memoryStr = jsonToPromptString({ 记忆: memory })
  const roundStr = jsonToPromptString({ 本轮引导: roundGuidance })
  const memoryAndRoundStr = `${memoryStr}\n${roundStr}`
  const stablePrefixChars = globalStr.length
  const memorySegmentChars = memoryStr.length

  if (strategy === 'S4') {
    const userSegments = [globalStr, memoryStr, roundStr]
    return {
      stablePrefixChars,
      memorySegmentChars,
      full,
      userSegments,
      userMessageCount: 3,
      strategy: 'S4',
      stablePrefix: globalStr,
      variableSuffix: memoryAndRoundStr,
    }
  }



  if (strategy === 'S3') {

    const messages = buildConversationMessages({

      systemPrompt: template.systemPrompt,

      stableUserJson: globalStr,

      slidingWindow: KV_CONVERSATION_WINDOW,

      currentUserJson: memoryAndRoundStr,

      narrativeHistory: dedupNarrativeHistory(

        context.narrativeHistory ?? [],

        context.recentNarrativeMemory,

      ),

    })

    const userMessageCount = messages.filter((m) => m.role === 'user').length



    return {

      stablePrefixChars,

      memorySegmentChars,

      full,

      messages,

      userMessageCount,

      strategy: 'S3',

      stablePrefix: globalStr,

      variableSuffix: memoryAndRoundStr,

    }

  }



  if (strategy === 'S2') {

    const userSegments = [globalStr, memoryAndRoundStr]

    return {

      stablePrefixChars,

      memorySegmentChars,

      full,

      userSegments,

      userMessageCount: 2,

      strategy: 'S2',

      stablePrefix: userSegments[0],

      variableSuffix: userSegments[1],

    }

  }



  return {

    stablePrefixChars,

    memorySegmentChars,

    full,

    userMessageCount: 1,

    strategy: 'S1',

    stablePrefix: globalStr,

    variableSuffix: memoryAndRoundStr,

  }

}



/**

 * 构建普通 Prompt（非分段，兼容旧模板替换）

 */

export function buildPrompt(template: PromptTemplate, context: PromptContext): string {

  if (template.name === 'narrative') {

    return jsonToPromptString(buildNarrativeUserJson(context))

  }



  let prompt = template.userPromptTemplate



  for (const variable of template.variables) {

    const placeholder = `{{${variable}}}`

    if (prompt.includes(placeholder)) {

      const key = variable as keyof PromptContext

      const value = context[key]

      const replacement = formatVariable(key, value)

      prompt = prompt.replaceAll(placeholder, replacement)

    }

  }



  return prompt

}



function formatVariable(_key: keyof PromptContext, value: unknown): string {

  if (value === null || value === undefined) return '""'

  return JSON.stringify(value)

}



/** 叙事 AI 调用：S1 单 user；S2 双 user；S3 用 segments.messages */

export function getNarrativeUserSegments(segments: PromptSegments): string[] | undefined {

  return segments.userSegments

}


