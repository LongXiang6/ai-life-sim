/**
 * Purpose: Map preset and custom world inputs into the immutable WorldConfig contract.
 * Owner: mod-world / preset-to-config.
 * Responsibility: Preset/custom world config mapping only; preset catalog and power-framework definitions stay in their owners.
 *
 * @module preset-to-config.ts
 * @description 预设/自定义世界 → WorldConfig 映射
 * @mod mod-world
 */

import type { DifficultyLevel, PowerFrameworkProposal } from '@/foundation'

import type { PresetWorld, WorldCategory } from '../constants/presets'
import type { WorldConfig } from '../types'
import { createDefaultPowerFramework, materializePowerFramework } from './power-framework'

const CATEGORY_ESSENCE: Record<WorldCategory, string> = {
  cultivation: 'cultivation',
  western_fantasy: 'western-fantasy',
  eastern_fantasy: 'wuxia',
  scifi: 'scifi',
  post_apocalyptic: 'post-apocalyptic',
  modern: 'modern',
  survival_horror: 'dark-fantasy',
  // 现代社会与超常异常并存的世界不能退化为纯现代世界；否则初始化会
  // 选中 MODERN 标签表，向叙事注入“无超自然”的硬约束。
  mixed: 'mixed',
}

const CATEGORY_POWER: Record<WorldCategory, string> = {
  cultivation: 'cultivation',
  western_fantasy: 'magic',
  eastern_fantasy: 'martial',
  scifi: 'technology',
  post_apocalyptic: 'none',
  modern: 'none',
  survival_horror: 'magic',
  mixed: 'mixed',
}

const CATEGORY_SPATIAL: Record<WorldCategory, string> = {
  cultivation: 'plane',
  western_fantasy: 'plane',
  eastern_fantasy: 'plane',
  scifi: 'universe',
  post_apocalyptic: 'plane',
  modern: 'plane',
  survival_horror: 'plane',
  mixed: 'plane',
}

const CATEGORY_CIVILIZATION: Record<WorldCategory, string> = {
  cultivation: 'medieval',
  western_fantasy: 'medieval',
  eastern_fantasy: 'medieval',
  scifi: 'modern',
  post_apocalyptic: 'industrial',
  modern: 'modern',
  survival_horror: 'medieval',
  mixed: 'modern',
}

/** 自定义世界输入（与 mod-pages SavedCustomWorld 字段对齐） */
export interface CustomWorldInput {
  name: string
  description: string
  worldview: string
  /** 纪元名称（如"公元"、"星际历"）。缺省时由引擎自动判定 */
  eraName?: string
  /** 纪元起始年份。0 表示无自定义纪年 */
  eraStartYear?: number
}

function inferCivilizationFromPreset(preset: PresetWorld): string {
  const year = typeof preset.config.eraStartYear === 'number' ? preset.config.eraStartYear : undefined
  if (preset.category === 'modern') return 'modern'
  if (preset.category === 'scifi') {
    if (year && year >= 3000) return 'space'
    return 'modern'
  }
  if (preset.category === 'post_apocalyptic') return 'industrial'
  if (preset.category === 'cultivation' || preset.category === 'western_fantasy') return 'medieval'
  return CATEGORY_CIVILIZATION[preset.category] ?? 'medieval'
}

/** 预设世界 → WorldConfig
 * @param preset 预设世界对象
 * @param difficulty 难度等级
 * @returns WorldConfig
 */
export function buildWorldConfigFromPreset(
  preset: PresetWorld,
  difficulty: DifficultyLevel,
): WorldConfig {
  const essenceTag = CATEGORY_ESSENCE[preset.category] ?? 'modern'
  let powerSystemTag = CATEGORY_POWER[preset.category] ?? 'none'

  if (preset.worldviewId === 'materialist') {
    powerSystemTag = 'none'
  }

  const spatialForm = CATEGORY_SPATIAL[preset.category] ?? 'plane'
  const customFramework = preset.config.powerFramework as PowerFrameworkProposal | undefined

  return {
    name: preset.name,
    essenceTag,
    powerSystemTag,
    powerFramework: customFramework
      ? materializePowerFramework(customFramework, {
          contextId: 'pending',
          powerSystemTag,
          source: 'world-custom',
        })
      : createDefaultPowerFramework(powerSystemTag, { source: 'world-default' }),
    spatialForm,
    civilizationStage: inferCivilizationFromPreset(preset),
    difficulty,
    description: preset.description,
    worldType: preset.category === 'mixed' ? 'mixed' : preset.worldviewId,
  }
}

/** 自定义世界 → WorldConfig
 * @param input 自定义世界输入
 * @param difficulty 难度等级
 * @returns WorldConfig
 */
export function buildWorldConfigFromCustom(
  input: CustomWorldInput,
  difficulty: DifficultyLevel,
): WorldConfig {
  const wv = input.worldview
  let essenceTag = 'modern'
  let powerSystemTag: string = 'none'

  if (wv === 'idealist' || wv === 'cultivation') {
    essenceTag = 'cultivation'
    powerSystemTag = 'cultivation'
  } else if (wv === 'materialist_cultivation') {
    essenceTag = 'materialist_cultivation'
    powerSystemTag = 'cultivation'
  } else if (wv === 'idealist_cultivation') {
    essenceTag = 'idealist_cultivation'
    powerSystemTag = 'cultivation'
  } else if (wv === 'materialist' || wv === 'modern') {
    essenceTag = 'modern'
    powerSystemTag = 'none'
  } else if (wv === 'survival_horror') {
    essenceTag = 'dark-fantasy'
    powerSystemTag = 'magic'
  }

  const spatialForm = essenceTag === 'scifi' ? 'universe' : 'plane'

  return {
    name: input.name,
    essenceTag,
    powerSystemTag,
    powerFramework: createDefaultPowerFramework(powerSystemTag, { source: 'world-default' }),
    spatialForm,
    civilizationStage: essenceTag === 'modern' || essenceTag === 'scifi' ? 'modern' : 'medieval',
    difficulty,
    description: input.description,
    // 纪元配置从用户输入传递，缺省时由引擎自动判定
    ...(input.eraName ? { eraName: input.eraName } : {}),
    ...(input.eraStartYear != null ? { eraStartYear: input.eraStartYear } : {}),
  }
}

/** 分配自定义世界编码（对齐废案 allocateWorldCode）
 * @returns 生成的世界编码
 */
export function allocateWorldCode(): number {
  const ts = Date.now() % 10_000_000_000
  const rand = Math.floor(Math.random() * 10_000)
  return ts * 10_000 + rand
}
