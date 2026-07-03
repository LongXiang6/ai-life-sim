/**
 * @module destiny-pattern-context.ts
 * @description 命格 AI 生成 Prompt 上下文组装 —— 精简版仅传世界名、描述、角色
 * @mod mod-character
 */

import { scaleTokenBudgetByInputLength, stringifyPrompt } from '@/foundation'

import type { KvPromptOrderResult } from '@/core/ai-service/kv-prompt-order'

import type { WorldCalibration, WorldConfig } from '@/mods/mod-world'
import {
  formatWorldTagsText,
  WORLDVIEW_TAG_DEFAULTS,
  resolveWorldviewStyleHint,
} from '@/mods/mod-world'

import {
  AI_DESTINY_PATTERN_BATCH_SIZE,
  PRESET_DESTINY_PATTERNS,
} from '../constants'
import { prepareFateUserPrompt } from '../utils/fate-kv'

/** 单条命格输出 token 估算（含 50–60 字描述 + 字段） */
const DESTINY_PATTERN_TOKENS_PER_ITEM = 280

/** description / effect 长度门禁（下限放宽至 20 字以接纳更多合理短描述，上限移除） */
export const DESTINY_PATTERN_DESC_MIN = 32
export const DESTINY_PATTERN_EFFECT_MIN = 5

export interface BuildDestinyPatternContextInput {
  worldConfig: WorldConfig | null | undefined
  calibration: WorldCalibration | null | undefined
  worldTags: string[] | undefined
  character: {
    name?: string
    race?: string
    gender?: string
    background?: string
    /** 开局年龄（仅质量门禁，不注入 AI 避免婴儿描写） */
    startingAge?: number
    attributes?: Record<string, number>
  }
  existingNames: string[]
  includePresetNames?: boolean
}

/** 命格生成 maxTokens：按条数 + userPrompt 长度（含 existingNames 膨胀）估算 */
export function estimateDestinyPatternTokenBudget(userPromptLength: number): number {
  const baseOutput = AI_DESTINY_PATTERN_BATCH_SIZE * DESTINY_PATTERN_TOKENS_PER_ITEM
  return scaleTokenBudgetByInputLength(baseOutput, userPromptLength, 12288)
}

/**
 * 解析注入 Prompt 的世界标签文本。
 *
 * 根因：store.worldTags 来自 world-init AI，易与 worldDescription 脱节且会持久化污染；
 * 优先使用 essenceTag / worldDescription 推导的结构化标签，AI 标签仅作次要参考。
 */
export function resolveDestinyPatternWorldTags(
  config: WorldConfig | null | undefined,
  aiTags: string[] | undefined,
): string {
  if (!config) {
    return (aiTags?.length ?? 0) > 0 ? aiTags!.join('、') : '（尚未生成）'
  }

  const desc = config.description?.trim() ?? ''
  const styleHint = resolveWorldviewStyleHint({
    essenceTag: config.essenceTag,
    worldDescription: desc,
    worldType: config.worldType,
  })

  // 优先级：AI 判定的 essenceTag > 描述关键词兜底
  let tagKey = config.essenceTag
  const hasKnownKey = !!tagKey && tagKey in WORLDVIEW_TAG_DEFAULTS
  if (!hasKnownKey && /无灵气|无魔力|唯心|意志即力量|心相/.test(desc)) {
    tagKey = config.worldType === 'idealist' ? 'idealist' : 'idealist_cultivation'
  }

  const defaults = WORLDVIEW_TAG_DEFAULTS[tagKey] ?? WORLDVIEW_TAG_DEFAULTS.mixed!
  const structured = formatWorldTagsText(defaults)

  const aiLine = (aiTags?.length ?? 0) > 0
    ? `\n【AI 氛围标签（次要参考；若与 worldDescription 冲突，以描述为准）】\n${aiTags!.join('、')}`
    : ''

  return `${structured}\n【主题风格】${styleHint}${aiLine}`
}

/** 组装并 stringify 命格 user Prompt（精简版：仅世界名、描述、角色，不再依赖校准管线） */
export function buildDestinyPatternUserPrompt(input: BuildDestinyPatternContextInput): string {
  const cfg = input.worldConfig
  const names = [...input.existingNames]
  if (input.includePresetNames) {
    for (const p of PRESET_DESTINY_PATTERNS) {
      if (!names.includes(p.name)) names.push(p.name)
    }
  }

  const charParts: string[] = []
  if (input.character.name) charParts.push(`姓名=${input.character.name}`)
  if (input.character.race) charParts.push(`种族=${input.character.race}`)
  if (input.character.gender) charParts.push(`性别=${input.character.gender}`)
  if (input.character.background) charParts.push(`背景=${input.character.background}`)

  const obj: Record<string, unknown> = {
    worldName: cfg?.name ?? '未知世界',
    worldDescription: cfg?.description?.trim() || '（无详细描述）',
    character: charParts.length > 0 ? charParts.join('，') : '（角色尚未设定）',
  }

  if (names.length > 0) {
    obj.existingNames = names.join('、')
  }

  return stringifyPrompt(obj)
}

/** 填充模板后应用 KV 键序（供 talent-draw 等直接 callAI 路径复用） */
export function buildDestinyPatternUserPromptKv(input: BuildDestinyPatternContextInput): KvPromptOrderResult {
  return prepareFateUserPrompt(buildDestinyPatternUserPrompt(input))
}

/** @deprecated 保留兼容；请改用 buildDestinyPatternUserPrompt */
export function fillDestinyPatternPrompt(template: string, ctx: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(ctx)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
}
