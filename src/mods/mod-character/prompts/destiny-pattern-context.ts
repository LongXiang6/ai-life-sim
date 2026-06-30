/**
 * @module destiny-pattern-context.ts
 * @description 命格 AI 生成 Prompt 上下文组装 —— 聚合世界/角色/校准信息
 * @mod mod-character
 */

import { scaleTokenBudgetByInputLength, stringifyPrompt } from '@/foundation'

import type { KvPromptOrderResult } from '@/core/ai-service/kv-prompt-order'

import type { WorldCalibration, WorldConfig } from '@/mods/mod-world'
import {
  formatCalibrationSummary,
  buildWorldCoherenceHint,
  formatWorldTagsText,
  WORLDVIEW_TAG_DEFAULTS,
  resolveWorldviewStyleHint,
} from '@/mods/mod-world'

import {
  AI_DESTINY_PATTERN_BATCH_SIZE,
  PRESET_DESTINY_PATTERNS,
} from '../constants'
import { prepareFateUserPrompt } from '../utils/fate-kv'
import { resolveDestinyPatternPromptWorldMeta } from '../utils/destiny-pattern-prompt-world-meta'

/** 单条命格输出 token 估算（含 50–60 字描述 + 字段） */
const DESTINY_PATTERN_TOKENS_PER_ITEM = 280

/** description / effect 长度门禁（下限放宽至 20 字以接纳更多合理短描述，上限移除） */
export const DESTINY_PATTERN_DESC_MIN = 20
export const DESTINY_PATTERN_EFFECT_MIN = 12

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

  let tagKey = config.essenceTag
  if (/无灵气|无魔力|唯心|意志即力量|心相/.test(desc)) {
    tagKey = config.worldType === 'idealist' ? 'idealist' : 'idealist_cultivation'
  }

  const defaults = WORLDVIEW_TAG_DEFAULTS[tagKey] ?? WORLDVIEW_TAG_DEFAULTS.mixed!
  const structured = formatWorldTagsText(defaults)

  const aiLine = (aiTags?.length ?? 0) > 0
    ? `\n【AI 氛围标签（次要参考；若与 worldDescription 冲突，以描述为准）】\n${aiTags!.join('、')}`
    : ''

  return `${structured}\n【主题风格】${styleHint}${aiLine}`
}

/** 组装并 stringify 命格 user Prompt（modifier 字段以嵌套 JSON 写入，避免引号破坏结构） */
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
  if (input.character.attributes && Object.keys(input.character.attributes).length > 0) {
    charParts.push(`属性=${JSON.stringify(input.character.attributes)}`)
  }

  const startingAge = input.character.startingAge ?? 0

  const worldMeta = resolveDestinyPatternPromptWorldMeta(cfg)

  return stringifyPrompt({
    worldDescription: cfg?.description?.trim() || '（无详细描述，请结合 essenceTag 推断）',
    coherenceHint: buildWorldCoherenceHint(
      worldMeta.civilizationStage,
      cfg?.description?.trim() ?? '',
    ),
    calibrationSummary: input.calibration
      ? formatCalibrationSummary(input.calibration)
      : '默认校准',
    worldTags: resolveDestinyPatternWorldTags(cfg, input.worldTags),
    worldName: cfg?.name ?? '未知世界',
    essenceTag: cfg?.essenceTag ?? 'generic',
    powerSystemTag: worldMeta.powerSystemTag,
    civilizationStage: worldMeta.civilizationStage,
    spatialForm: cfg?.spatialForm ?? 'unknown',
    powerCeiling: String(worldMeta.powerCeiling),
    personalModifierFields: worldMeta.personalModifierFields,
    worldModifierFields: worldMeta.worldModifierFields,
    startingAge,
    instruction: '请为以下世界生成 20 条命格或天赋',
    character: charParts.length > 0 ? charParts.join('；') : '（角色尚未设定）',
    requirements: [
      '严格遵守 System Prompt 中 temporalRules.forbidden 全部禁止项（不得描写出生/童年/未来场景、社会身份、家庭背景）',
      '命格（type=命格）占 20–30%，特征（type=特征）占 70–80%',
      '每条 description 必须 50–60 汉字（含标点），写满一段有画面感的白话',
      '每条 effect 必须 15–25 汉字',
      '稀有度分布：common≈40%、fine≈30%、rare≈15%、epic≈10%、legendary≈5%；每批 legendary≤3、epic≤8；至少 1 条 rare 及以上',
      '输出紧凑 JSON 对象 { "patterns": [ ... ] }，patterns 为命格或天赋数组，每条含 type 字段',
      'attrBonus 仅含非零字段；common/fine 禁止 systemModifiers；禁止 null 占位字段',
      '数值平衡，systemModifiers 影响力宜小',
    ],
    existingNames: names.length > 0 ? names.join('、') : '无',
  })
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
