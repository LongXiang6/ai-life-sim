/**
 * Purpose: Project equipped reincarnation talents and destiny patterns for main-narrative prompt fields.
 * Owner: mod-engine
 * Responsibility: Talent text projection only; pattern ownership and prompt assembly remain separate.
 */

import type { NarrativeTalentPromptView } from '@/foundation'

export function formatEquippedReincarnationTalentsForPrompt(talents: readonly {
  name: string
  description: string
  effect: string
}[] | null | undefined): NarrativeTalentPromptView[] {
  const rules = (talents ?? []).flatMap((talent) => {
    const effect = talent.effect.trim()
    if (!effect) return []
    const name = talent.name.trim() || '未命名轮回天赋'
    return [{ 名称: name, 效果: effect }]
  })
  return rules
}

export function formatDestinyPatternsForPrompt(
  patterns: readonly { name: string; description: string; effect: string }[],
  _includeDescription: boolean,
): NarrativeTalentPromptView[] {
  const rows = patterns.flatMap((pattern) => {
    const name = pattern.name.trim()
    const effect = pattern.effect.trim()
    const description = pattern.description.trim()
    const rule = effect || description
    if (!name || !rule) return []
    return [{ 名称: name, 效果: rule }]
  })
  return rows
}
