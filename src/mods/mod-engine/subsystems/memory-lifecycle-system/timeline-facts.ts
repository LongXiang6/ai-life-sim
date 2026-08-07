/**
 * Purpose: Project player-created facts and relationship continuity into the unified memory timeline.
 * Owner: mod-engine / memory-lifecycle
 * Responsibility: Pure timeline projection only; record ownership and persistence stay in MemoryLifecycleSystem.
 */

import type { CharacterCreation } from '../../types'
import { AI_CREATION_CATEGORIES } from '../../helpers/narrative-ai-protocol'
import {
  isNarrativeRecordVisible,
  type NarrativeScopeView,
} from '../../helpers/narrative-context-scope'
import type { NarrativeTimelineEntry } from '../../helpers/timeline-memory'
import type {
  MemoryRoundTime,
  RelationshipMemoryRecord,
} from './contracts'

const RELATIONSHIP_LABELS: Record<RelationshipMemoryRecord['type'], string> = {
  first_meeting: '初次相识',
  conflict: '发生冲突',
  alliance: '结成同盟',
  betrayal: '遭遇背叛',
  marriage: '建立婚姻',
  death: '见证离世',
  other: '发生重要互动',
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
    const category = AI_CREATION_CATEGORIES.internalToAI[creation.category] ?? '其他'
    return {
      timeSpan: time?.displayTimeLabel ?? roundLabel,
      occurrenceTime: occurrenceParts.join(' · '),
      text: `玩家角色亲自开创[玩家原创·${category}] ${creation.name}：${creation.description}`,
      sortRound: creation.confirmedRound,
      sortTotalDays: time?.totalDays,
    }
  })
}

export function buildRelationshipTimelineEntries(
  records: readonly RelationshipMemoryRecord[],
  view: NarrativeScopeView,
  currentEntities: ReadonlySet<string>,
  currentRound: number,
  resolveRoundTime?: (round: number) => MemoryRoundTime | undefined,
): NarrativeTimelineEntry[] {
  return records.flatMap((record) => {
    if (!isNarrativeRecordVisible(record, view)) return []
    const immediatelyRelevant = record.round >= Math.max(1, currentRound - 1)
    if (record.importance !== 'HIGH' && !currentEntities.has(record.personName) && !immediatelyRelevant) return []
    const time = resolveRoundTime?.(record.round)
    const roundLabel = `第${record.round}轮`
    const timeLabel = time?.displayTimeLabel ?? roundLabel
    const contextLabel = record.contextId ? `【发生区域：${record.contextId}】\n` : ''
    return [{
      timeSpan: timeLabel,
      occurrenceTime: [
        timeLabel,
        time?.displayAge === undefined ? undefined : `角色${time.displayAge}岁`,
      ].filter((part): part is string => Boolean(part)).join(' · '),
      text: `${contextLabel}人物连续性：你与${record.personName}${RELATIONSHIP_LABELS[record.type]}，${record.summary}`,
      sortRound: record.round,
      sortTotalDays: time?.totalDays,
    }]
  })
}
