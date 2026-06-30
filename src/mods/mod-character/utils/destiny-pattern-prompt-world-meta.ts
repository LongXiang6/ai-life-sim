/**
 * @module destiny-pattern-prompt-world-meta.ts
 * @description 命格 Prompt 用世界元数据校正 —— 避免 store 脏数据污染 AI 上下文
 * @mod mod-character
 */

import type { WorldConfig } from '@/mods/mod-world'

import {
  DESTINY_PATTERN_PERSONAL_MODIFIERS,
  DESTINY_PATTERN_WORLD_MODIFIERS,
} from '../constants'

const SUPERNATURAL_MARKERS = /灵气|修炼|魔法|神明|怪物|宗门|功法|灵力|超自然/
const MODERN_MARKERS = /现代|2000|互联网|千禧|都市|科学|信息时代/

export interface ResolvedDestinyPatternWorldMeta {
  powerSystemTag: string
  civilizationStage: string
  powerCeiling: number
  personalModifierFields: Record<string, string>
  worldModifierFields: Record<string, string>
}

function isModernMundaneWorld(config: WorldConfig | null | undefined): boolean {
  if (!config) return false
  const desc = config.description?.trim() ?? ''
  const tag = config.essenceTag?.toLowerCase() ?? ''
  if (tag === 'modern' || tag === 'scifi' || tag === 'contemporary') return true
  if (MODERN_MARKERS.test(desc) && !SUPERNATURAL_MARKERS.test(desc)) return true
  return false
}

function isCultivationWorld(config: WorldConfig | null | undefined): boolean {
  if (!config) return false
  const desc = config.description?.trim() ?? ''
  const tag = config.powerSystemTag?.toLowerCase() ?? ''
  const essence = config.essenceTag?.toLowerCase() ?? ''
  if (tag === 'cultivation' || essence === 'cultivation' || essence === 'xianxia') return true
  return SUPERNATURAL_MARKERS.test(desc) && !MODERN_MARKERS.test(desc)
}

/** 校正注入 Prompt 的力量/文明标签，优先 worldDescription */
export function resolveDestinyPatternPromptWorldMeta(
  config: WorldConfig | null | undefined,
): ResolvedDestinyPatternWorldMeta {
  const modernMundane = isModernMundaneWorld(config)
  const cultivation = isCultivationWorld(config)

  let powerSystemTag = config?.powerSystemTag ?? 'none'
  let civilizationStage = config?.civilizationStage ?? 'unknown'
  let powerCeiling = config?.powerCeiling ?? 5

  if (modernMundane && !cultivation) {
    powerSystemTag = 'none'
    if (civilizationStage === 'medieval' || civilizationStage === 'unknown') {
      civilizationStage = 'modern'
    }
    if (powerCeiling > 3) powerCeiling = 1
  }

  const personalEntries = Object.entries(DESTINY_PATTERN_PERSONAL_MODIFIERS).filter(([key]) => {
    if (cultivation) return true
    return !['cultivationSpeedModifier', 'bottleneckModifier', 'breakthroughChanceModifier'].includes(key)
  })

  const worldEntries = Object.entries(DESTINY_PATTERN_WORLD_MODIFIERS).filter(([key]) => {
    if (cultivation) return true
    return key !== 'monsterThreatModifier'
  })

  return {
    powerSystemTag,
    civilizationStage,
    powerCeiling,
    personalModifierFields: Object.fromEntries(personalEntries),
    worldModifierFields: Object.fromEntries(worldEntries),
  }
}
