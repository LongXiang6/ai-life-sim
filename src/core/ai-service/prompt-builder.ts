/**

 * @module prompt-builder.ts

 * @description Prompt 组装器 —— KV Cache 优化 + 完整 narrative 模板

 * @mod core

 *

 * Phase 7 策略：

 *   S1（默认）：单条 user JSON，键按 稳定→缓变→速变 排序

 *   S2：两条 user，稳定+缓变 | 速变

 *   S3：system + user(stable) + assistant ack + 滑动 user/assistant + user(current)

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

export type PromptSegmentStrategy = 'S1' | 'S2' | 'S3' | 'legacy'



/**

 * Prompt 分段结果

 */

export interface PromptSegments {

  /** 稳定前缀字符数（观测用） */

  stablePrefixChars: number

  /** 完整 user JSON（S1 主路径 / 降级 fallback） */

  full: string

  /** 可选：S2 双 user 分段 */

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

}



/** JSON 键序：L0 稳定 → L1 缓变 → L2 速变（注意力 + KV 前缀） */

const STABLE_JSON_KEYS = [
  '世界规则',
  'MOD世界规则',
  '世界标签',
  '世界校准',
  '世界设定',
  '力量体系',
  '玩家自定义',
  '原创保护',
  '叙事风格',
  '叙事基调',
  '子系统变更指南',
  '字数约束',
] as const

const SLOW_JSON_KEYS = [
  '角色',
  '命格天赋',
] as const

const FAST_JSON_KEYS = [
  '剧情阶段',
  '记忆摘要',
  '核心记忆',
  '待触发伏笔',
  '事件注入',
  '时间桥摘要',
  '因果链提示',
  '当前时间',
  '当前状态',
  '最近变化',
  '叙事历史',
  '指令',
  '时间描写指南',
  '叙事引导',
] as const



type NarrativeJsonKey =

  | (typeof STABLE_JSON_KEYS)[number]

  | (typeof SLOW_JSON_KEYS)[number]

  | (typeof FAST_JSON_KEYS)[number]



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

  memorySummary?: string,

): string[] {

  if (!DEDUP_NARRATIVE_HISTORY) return narrativeHistory



  let history = [...narrativeHistory]



  if (memorySummary?.includes('【最新发展】')) {

    history = history.slice(-2)

  }



  if (!memorySummary?.trim()) return history



  const memoryNorm = memorySummary.trim()

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

  if (KV_MESSAGE_STRATEGY === 'S3') return 'S3'

  if (KV_MESSAGE_STRATEGY === 'S2' || KV_TWO_USER_SEGMENTS) return 'S2'

  return 'S1'

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

  options?: BuildNarrativeUserJsonOptions,

): Record<string, unknown> {

  const omitHistory = options?.omitNarrativeHistory ?? resolveMessageStrategy() === 'S3'

  let narrativeHistory = dedupNarrativeHistory(

    context.narrativeHistory ?? [],

    context.memorySummary,

  )



  if (omitHistory) {

    narrativeHistory = []

  }



  const raw: Record<NarrativeJsonKey, unknown> = {

    世界规则: context.worldRules,
    MOD世界规则: context.modWorldRules,
    世界标签: context.worldTagsText,
    世界校准: context.calibrationSummary,
    世界设定: context.worldSetting,
    力量体系: context.powerCeilingPresets,
    玩家自定义: context.worldCustomizeText,
    原创保护: context.creationProtectionText,
    叙事风格: context.narrativeStyle,
    叙事基调: context.narrativeToneHint,
    子系统变更指南: context.subsystemGuideText,
    字数约束: context.wordCountInstruction,
    当前时间: context.currentTime,

    角色: context.character,

    记忆摘要: context.memorySummary,

    核心记忆: context.coreMemory,

    剧情阶段: context.plotStructureText,

    待触发伏笔: context.foreshadowingText,

    事件注入: context.eventInjectionText,
    时间桥摘要: context.timeBridgeSummary,
    因果链提示: context.causalChainHint,
    当前状态: context.subsystemSummaries,

    最近变化: context.systemChangeSummary,

    叙事历史: narrativeHistory,

    指令: context.userInstruction,

    时间描写指南: context.timeGuideText,

    叙事引导: context.narrativeGuidanceText,

    命格天赋: context.talents,

  }



  const orderedKeys = [...STABLE_JSON_KEYS, ...SLOW_JSON_KEYS, ...FAST_JSON_KEYS]

  const obj: Record<string, unknown> = {}



  for (const key of orderedKeys) {

    const value = raw[key]

    if (key === '叙事历史' && omitHistory) continue

    if (OMIT_EMPTY_PROMPT_FIELDS && isEmptyPromptValue(value)) continue

    obj[key] = value

  }



  return obj

}



function jsonToPromptString(obj: Record<string, unknown>): string {

  return stringifyPrompt(obj)

}



function pickJsonKeys(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {

  const out: Record<string, unknown> = {}

  for (const key of keys) {

    if (key in obj) out[key] = obj[key]

  }

  return out

}



/**

 * 组装 KV Cache 优化的分段 Prompt

 */

export function buildSegmentedPrompt(template: PromptTemplate, context: PromptContext): PromptSegments {

  const strategy = resolveMessageStrategy()

  const fullObj = buildNarrativeUserJson(context, { omitNarrativeHistory: strategy === 'S3' })

  const full = jsonToPromptString(fullObj)



  const stableObj = pickJsonKeys(fullObj, STABLE_JSON_KEYS)

  const slowObj = pickJsonKeys(fullObj, SLOW_JSON_KEYS)

  const fastObj = pickJsonKeys(fullObj, FAST_JSON_KEYS)



  const stableSlowStr = jsonToPromptString({ ...stableObj, ...slowObj })

  const stablePrefixChars = stableSlowStr.length

  const fastStr = jsonToPromptString(fastObj)



  if (strategy === 'S3') {

    const messages = buildConversationMessages({

      systemPrompt: template.systemPrompt,

      stableUserJson: stableSlowStr,

      slidingWindow: KV_CONVERSATION_WINDOW,

      currentUserJson: fastStr,

      narrativeHistory: dedupNarrativeHistory(

        context.narrativeHistory ?? [],

        context.memorySummary,

      ),

    })

    const userMessageCount = messages.filter((m) => m.role === 'user').length



    return {

      stablePrefixChars,

      full,

      messages,

      userMessageCount,

      strategy: 'S3',

      stablePrefix: stableSlowStr,

      variableSuffix: fastStr,

    }

  }



  if (strategy === 'S2') {

    const userSegments = [stableSlowStr, fastStr]

    return {

      stablePrefixChars,

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

    full,

    userMessageCount: 1,

    strategy: 'S1',

    stablePrefix: stableSlowStr,

    variableSuffix: fastStr,

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


