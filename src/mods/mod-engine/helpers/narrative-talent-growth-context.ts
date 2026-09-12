/**
 * Purpose: Assemble the frozen destiny-pattern evidence for the talent-growth call.
 * Owner: mod-engine
 * Responsibility: Serialize only the approved 03 input fields in sample order.
 */

import type { CompressedSummaries } from '@/foundation'
import {
  DESTINY_PATTERN_CATEGORY_CONFIG,
  DESTINY_PATTERN_GROWTH_MINIMUM_AGE,
  DESTINY_PATTERN_RARITY_CONFIG,
  type AttributeModifiers,
  type DestinyPattern,
  type DestinyPatternGrowthHistoryEntry,
} from '@/mods/mod-character'
import { BASE_POINTS_PER_YEAR, basePointsFromCalendarDays, basePointsToCalendarDays } from '@/foundation'
import type { RecentStoryProjection } from './recent-story-context'

const NEXT_RARITY_LABEL: Readonly<Record<Exclude<DestinyPattern['rarity'], 'legendary' | 'mythic'>, string>> = {
  common: '精良',
  fine: '稀有',
  rare: '史诗',
  epic: '传说',
}

export const DESTINY_PATTERN_MINIMUM_EVIDENCE_WINDOWS: Readonly<Record<Exclude<DestinyPattern['rarity'], 'legendary' | 'mythic'>, number>> = {
  common: 2,
  fine: 3,
  rare: 4,
  epic: 5,
}

export function getDestinyPatternMinimumEvidenceWindows(
  rarity: Exclude<DestinyPattern['rarity'], 'legendary' | 'mythic'>,
): number {
  return DESTINY_PATTERN_MINIMUM_EVIDENCE_WINDOWS[rarity]
}

const TALENT_GROWTH_COOLDOWN_ROUNDS = 20
const TALENT_GROWTH_COOLDOWN_BASE_POINTS = 20 * BASE_POINTS_PER_YEAR
const TALENT_GROWTH_PER_LINEAGE_LIMIT = 2
const TALENT_GROWTH_TOTAL_LIMIT = 6
export const TALENT_GROWTH_MINIMUM_AGE = DESTINY_PATTERN_GROWTH_MINIMUM_AGE

export interface NarrativeTalentGrowthPromptInput {
  userSegments: [string, string, string]
  eligiblePatterns: DestinyPattern[]
  evidenceWindowsByLineage: Readonly<Record<string, NarrativeTalentGrowthEvidenceWindow[]>>
}

export interface NarrativeTalentGrowthEvidenceWindow {
  id: string
  round: number
  time: string
  facts: string[]
}

function projectAttributeBonus(bonus: Partial<AttributeModifiers>): Record<string, number> {
  return {
    ...(bonus.mind === undefined ? {} : { 心智: bonus.mind }),
    ...(bonus.physique === undefined ? {} : { 体魄: bonus.physique }),
    ...(bonus.charisma === undefined ? {} : { 魅力: bonus.charisma }),
    ...(bonus.familyBackground === undefined ? {} : { 家境: bonus.familyBackground }),
    ...(bonus.luck === undefined ? {} : { 气运: bonus.luck }),
  }
}

function storyTime(story: RecentStoryProjection): string {
  return story.规范时间.时间标签?.trim() || `第${story.回合}轮`
}

export function buildNarrativeTalentGrowthPromptInput(input: {
  patterns: readonly DestinyPattern[]
  compressedSummaries: CompressedSummaries
  recentStories: readonly RecentStoryProjection[]
  currentRound: number
  totalBasePoints: number
  currentAge: number
  growthHistory: readonly DestinyPatternGrowthHistoryEntry[]
  characterContext?: Record<string, unknown>
  worldContext?: Record<string, unknown>
}): NarrativeTalentGrowthPromptInput {
  const currentAge = Number.isFinite(input.currentAge)
    ? Math.max(0, Math.floor(input.currentAge))
    : 0
  const promptPatterns = currentAge >= TALENT_GROWTH_MINIMUM_AGE
    ? input.patterns
      .filter((pattern) => pattern.rarity !== 'legendary' && pattern.rarity !== 'mythic')
      .map((pattern) => structuredClone(pattern))
    : []
  const growthByLineage = new Map<string, DestinyPatternGrowthHistoryEntry[]>()
  for (const entry of input.growthHistory) {
    const entries = growthByLineage.get(entry.lineageId) ?? []
    entries.push(entry)
    growthByLineage.set(entry.lineageId, entries)
  }
  const evidenceWindows = new Map<number, NarrativeTalentGrowthEvidenceWindow>()
  const addEvidenceWindow = (round: number, time: string, fact: string): void => {
    if (!Number.isSafeInteger(round) || round < 1 || !fact.trim()) return
    const existing = evidenceWindows.get(round)
    if (existing) {
      if (!existing.facts.includes(fact)) existing.facts.push(fact)
      return
    }
    evidenceWindows.set(round, {
      id: `round:${round}`,
      round,
      time: time.trim() || `第${round}轮`,
      facts: [fact],
    })
  }
  for (const summary of input.compressedSummaries.summaries) {
    if (!Number.isSafeInteger(summary.sourceRound) || summary.sourceRound < 1) continue
    for (const event of summary.memoryEvents) {
      addEvidenceWindow(
        summary.sourceRound,
        event.timeSpan || event.occurrenceTime,
        `${event.occurrenceTime}：${event.text}`,
      )
    }
  }
  for (const story of input.recentStories) {
    addEvidenceWindow(story.回合, storyTime(story), story.故事全文)
  }
  const sortedEvidenceWindows = [...evidenceWindows.values()].sort((left, right) => left.round - right.round)
  const evidenceWindowsByLineage: Record<string, NarrativeTalentGrowthEvidenceWindow[]> = {}
  const eligiblePatterns = promptPatterns.filter((pattern) => {
    const lineageHistory = growthByLineage.get(pattern.lineageId) ?? []
    if (lineageHistory.length >= TALENT_GROWTH_PER_LINEAGE_LIMIT) return false
    if (input.growthHistory.length >= TALENT_GROWTH_TOTAL_LIMIT) return false
    if (!(pattern.rarity in DESTINY_PATTERN_MINIMUM_EVIDENCE_WINDOWS)) return false
    const minimumWindows = DESTINY_PATTERN_MINIMUM_EVIDENCE_WINDOWS[pattern.rarity as keyof typeof DESTINY_PATTERN_MINIMUM_EVIDENCE_WINDOWS]
    if (!Number.isFinite(minimumWindows)) return false
    const lastGrowth = lineageHistory.reduce<DestinyPatternGrowthHistoryEntry | undefined>(
      (latest, entry) => (!latest || entry.roundSequence > latest.roundSequence ? entry : latest),
      undefined,
    )
    const availableEvidenceWindows = sortedEvidenceWindows.filter((window) => (
      !lastGrowth || window.round > lastGrowth.roundSequence
    ))
    if (availableEvidenceWindows.length < minimumWindows) return false
    const roundReady = !lastGrowth
      || input.currentRound - lastGrowth.roundSequence >= TALENT_GROWTH_COOLDOWN_ROUNDS
    const lastGrowthBasePoints = lastGrowth?.totalBasePoints
      ?? basePointsFromCalendarDays(lastGrowth?.totalDays ?? 0)
    const timeReady = !lastGrowth
      || input.totalBasePoints - lastGrowthBasePoints > TALENT_GROWTH_COOLDOWN_BASE_POINTS
    const eligible = roundReady
      && timeReady
    if (eligible) evidenceWindowsByLineage[pattern.lineageId] = availableEvidenceWindows
    return eligible
  })
  const history = input.compressedSummaries.summaries.flatMap((summary) => (
    summary.memoryEvents.map((event) => `${event.occurrenceTime}：${event.text}`)
  ))
  const patterns = eligiblePatterns.map((pattern) => ({
    命格血脉编号: pattern.lineageId,
    当前版本: pattern.version,
    名称: pattern.name,
    分类: DESTINY_PATTERN_CATEGORY_CONFIG[pattern.category].label,
    等级: DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity].label,
    详细介绍: pattern.description,
    效果描述: pattern.effect,
      当前完整属性加成: projectAttributeBonus(pattern.attrBonus),
    目标等级: NEXT_RARITY_LABEL[pattern.rarity as Exclude<DestinyPattern['rarity'], 'legendary' | 'mythic'>],
    允许属性: ['心智', '体魄', '魅力', '家境', '气运'],
    可用证据窗口: (evidenceWindowsByLineage[pattern.lineageId] ?? []).map((window) => ({
      编号: window.id,
      时间: window.time,
      已成立事实: window.facts,
    })),
  }))
  const growthHistorySummary = input.growthHistory.map((entry) => ({
    天赋血脉编号: entry.lineageId,
    成长回合: entry.roundSequence,
    成长基础点: entry.totalBasePoints ?? basePointsFromCalendarDays(entry.totalDays),
    成长派生日历天数: entry.totalDays,
    结果名称: entry.result.name,
    结果等级: DESTINY_PATTERN_RARITY_CONFIG[entry.result.rarity].label,
  }))
  return {
    userSegments: [
      JSON.stringify({ 历史记忆: history }),
      JSON.stringify({
        最近两轮详细记忆: input.recentStories.slice(-2).map((story) => ({
          时间: storyTime(story),
          正文: story.故事全文,
        })),
      }),
      JSON.stringify({
        当前回合: input.currentRound,
        当前基础点: input.totalBasePoints,
        当前派生日历天数: basePointsToCalendarDays(input.totalBasePoints),
        当前年龄: currentAge,
        玩家已选天赋: patterns,
        天赋成长历史: growthHistorySummary,
        角色上下文: input.characterContext ?? {},
        世界上下文: input.worldContext ?? {},
      }),
    ],
    eligiblePatterns,
    evidenceWindowsByLineage,
  }
}
