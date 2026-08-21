/**
 * Purpose: Project player-created facts into the unified memory timeline.
 * Owner: mod-engine / memory-lifecycle
 * Responsibility: Pure creation-fact projection only.
 */

import type { NarrativeTimelineEntry } from '../../helpers/timeline-memory'
import type { CharacterCreation } from '../../types'
import type { MemoryRoundTime } from './contracts'

const CREATION_CATEGORY_LABELS: Readonly<Record<CharacterCreation['category'], string>> = {
  power_system: '力量体系',
  technique: '技法',
  ability: '能力',
  rule: '规则',
  object: '物品',
  other: '其他',
}

export function buildCreationTimelineEntries(
  characterCreations: readonly CharacterCreation[],
  resolveRoundTime?: (round: number) => MemoryRoundTime | undefined,
): NarrativeTimelineEntry[] {
  return characterCreations.map((creation) => {
    const time = resolveRoundTime?.(creation.confirmedRound)
    const roundLabel = `第${creation.confirmedRound}轮`
    const occurrenceParts = [
      time?.displayTimeLabel ?? roundLabel,
      time?.displayAge === undefined ? undefined : `角色${time.displayAge}岁`,
    ].filter((part): part is string => Boolean(part))
    const category = CREATION_CATEGORY_LABELS[creation.category] ?? '其他'
    return {
      timeSpan: time?.displayTimeLabel ?? roundLabel,
      occurrenceTime: occurrenceParts.join(' · '),
      text: `玩家角色亲自开创[玩家原创·${category}] ${creation.name}：${creation.description}`,
      sortRound: creation.confirmedRound,
      sortTotalDays: time?.totalDays,
    }
  })
}
