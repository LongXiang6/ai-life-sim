/**
 * Purpose: Project equipped reincarnation talents and destiny patterns for main-narrative prompt fields.
 * Owner: mod-engine
 * Responsibility: Talent text projection only; pattern ownership and prompt assembly remain separate.
 */

import type { NarrativeTalentPromptView } from '@/foundation'
import {
  DESTINY_PATTERN_APTITUDE_CONFIG,
  DESTINY_PATTERN_DEVELOPMENT_STAGE_CONFIG,
  type DestinyPatternAptitudeTier,
  type DestinyPatternDevelopmentStage,
} from '@/mods/mod-character'

function aptitudeLabel(aptitudeTier: number): string {
  return DESTINY_PATTERN_APTITUDE_CONFIG[aptitudeTier as DestinyPatternAptitudeTier].label
}

export function formatEquippedReincarnationTalentsForPrompt(talents: readonly {
  name: string
  description: string
  effect: string
  aptitudeTier: number
  developmentStage: DestinyPatternDevelopmentStage
  apexStrengthenLevel?: number
}[] | null | undefined): NarrativeTalentPromptView[] {
  const rules = (talents ?? []).flatMap((talent, index) => {
    const effect = talent.effect.trim()
    if (!effect) return []
    const name = talent.name.trim() || '未命名轮回天赋'
    return [{
      引用: `轮回-${index + 1}`,
      名称: name,
      资质阶位: aptitudeLabel(talent.aptitudeTier),
      开发阶段: DESTINY_PATTERN_DEVELOPMENT_STAGE_CONFIG[talent.developmentStage].label,
      ...(Number.isSafeInteger(talent.apexStrengthenLevel) && (talent.apexStrengthenLevel ?? 0) > 0
        ? { 至高强化阶数: talent.apexStrengthenLevel }
        : {}),
      效果: effect,
    }]
  })
  return rules
}

export function formatDestinyPatternsForPrompt(
  patterns: readonly {
    name: string
    description: string
    effect: string
    aptitudeTier: number
    developmentStage: DestinyPatternDevelopmentStage
    reference?: string
  }[],
  _includeDescription: boolean,
): NarrativeTalentPromptView[] {
  const rows = patterns.flatMap((pattern) => {
    const name = pattern.name.trim()
    const effect = pattern.effect.trim()
    const description = pattern.description.trim()
    const rule = effect || description
    if (!name || !rule) return []
    return [{
      ...(pattern.reference ? { 引用: pattern.reference } : {}),
      名称: name,
      资质阶位: aptitudeLabel(pattern.aptitudeTier),
      开发阶段: DESTINY_PATTERN_DEVELOPMENT_STAGE_CONFIG[pattern.developmentStage].label,
      效果: rule,
    }]
  })
  return rows
}
