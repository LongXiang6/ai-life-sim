/**
 * Purpose: Assemble the frozen destiny-pattern evidence for the talent-growth call.
 * Owner: mod-engine
 * Responsibility: Serialize only the approved 03 input fields in sample order.
 */

import type { CompressedSummaries } from '@/foundation'
import {
  DESTINY_PATTERN_APTITUDE_CONFIG,
  DESTINY_PATTERN_CATEGORY_CONFIG,
  DESTINY_PATTERN_DEVELOPMENT_STAGE_CONFIG,
  DESTINY_PATTERN_GROWTH_MINIMUM_AGE,
  getNextDestinyPatternDevelopmentStage,
  type AttributeModifiers,
  type DestinyPattern,
  type DestinyPatternDevelopmentStage,
  type DestinyPatternGrowthAssessment,
  type DestinyPatternGrowthEvidence,
  type DestinyPatternGrowthHistoryEntry,
} from '@/mods/mod-character'
import { BASE_POINTS_PER_YEAR, basePointsFromCalendarDays, basePointsToCalendarDays } from '@/foundation'
import type { RecentStoryProjection } from './recent-story-context'

export const DESTINY_PATTERN_MINIMUM_EVIDENCE_WINDOWS: Readonly<Record<Exclude<DestinyPatternDevelopmentStage, 'complete'>, number>> = {
  awakening: 2,
  mastery: 3,
}

export function getDestinyPatternMinimumEvidenceWindows(
  developmentStage: Exclude<DestinyPatternDevelopmentStage, 'complete'>,
): number {
  return DESTINY_PATTERN_MINIMUM_EVIDENCE_WINDOWS[developmentStage]
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
  assessmentUpdates: DestinyPatternGrowthAssessment[]
}

export interface NarrativeTalentGrowthEvidenceWindow {
  id: string
  round: number
  time: string
  facts: string[]
  breakthrough?: string
}

function projectAttributeBonus(bonus: Partial<AttributeModifiers>): Record<string, number> {
  return {
    ...(bonus.mind === undefined ? {} : { 心智: bonus.mind }),
    ...(bonus.physique === undefined ? {} : { 体魄: bonus.physique }),
    ...(bonus.charisma === undefined ? {} : { 魅力: bonus.charisma }),
    ...(bonus.familyBackground === undefined ? {} : { 财富: bonus.familyBackground }),
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
  totalBasePoints?: number
  totalDays?: number
  currentAge: number
  growthHistory: readonly DestinyPatternGrowthHistoryEntry[]
  growthEvidence?: readonly DestinyPatternGrowthEvidence[]
  growthAssessments?: readonly DestinyPatternGrowthAssessment[]
  characterContext?: Record<string, unknown>
  worldContext?: Record<string, unknown>
}): NarrativeTalentGrowthPromptInput {
  const currentAge = Number.isFinite(input.currentAge)
    ? Math.max(0, Math.floor(input.currentAge))
    : 0
  const totalBasePoints = Number.isFinite(input.totalBasePoints)
    ? Math.max(0, Math.floor(input.totalBasePoints!))
    : basePointsFromCalendarDays(
        Number.isFinite(input.totalDays) ? Math.max(0, Math.floor(input.totalDays!)) : 0,
      )
  const growthEvidence = input.growthEvidence ?? []
  const growthAssessments = input.growthAssessments ?? []
  const promptPatterns = currentAge >= TALENT_GROWTH_MINIMUM_AGE
    ? input.patterns
      .filter((pattern) => pattern.developmentStage !== 'complete')
      .map((pattern) => structuredClone(pattern))
    : []
  const growthByLineage = new Map<string, DestinyPatternGrowthHistoryEntry[]>()
  for (const entry of input.growthHistory) {
    const entries = growthByLineage.get(entry.lineageId) ?? []
    entries.push(entry)
    growthByLineage.set(entry.lineageId, entries)
  }
  const evidenceWindows = new Map<number, NarrativeTalentGrowthEvidenceWindow>()
  const evidenceWindowsByLineageSource = new Map<string, Map<number, NarrativeTalentGrowthEvidenceWindow>>()
  const addEvidenceWindow = (
    round: number,
    time: string,
    fact: string,
    breakthrough?: string,
  ): void => {
    if (!Number.isSafeInteger(round) || round < 1 || !fact.trim()) return
    const existing = evidenceWindows.get(round)
    if (existing) {
      if (!existing.facts.includes(fact)) existing.facts.push(fact)
      if (!existing.breakthrough && breakthrough?.trim()) existing.breakthrough = breakthrough.trim()
      return
    }
    evidenceWindows.set(round, {
      id: `round:${round}`,
      round,
      time: time.trim() || `第${round}轮`,
      facts: [fact],
      ...(breakthrough?.trim() ? { breakthrough: breakthrough.trim() } : {}),
    })
  }
  for (const evidence of growthEvidence) {
    if (evidence.sourceRound > input.currentRound) continue
    const fact = evidence.usage?.trim()
      ? `实际使用：${evidence.usage}；可观察结果：${evidence.result}`
      : `可观察结果：${evidence.result}`
    addEvidenceWindow(evidence.sourceRound, `第${evidence.sourceRound}轮`, fact, evidence.breakthrough)
    const lineageWindows = evidenceWindowsByLineageSource.get(evidence.lineageId) ?? new Map()
    const existing = lineageWindows.get(evidence.sourceRound)
    if (existing) {
      if (!existing.facts.includes(fact)) existing.facts.push(fact)
      if (!existing.breakthrough && evidence.breakthrough?.trim()) {
        existing.breakthrough = evidence.breakthrough.trim()
      }
    } else {
      lineageWindows.set(evidence.sourceRound, {
        id: `round:${evidence.sourceRound}`,
        round: evidence.sourceRound,
        time: `第${evidence.sourceRound}轮`,
        facts: [fact],
        ...(evidence.breakthrough?.trim() ? { breakthrough: evidence.breakthrough.trim() } : {}),
      })
    }
    evidenceWindowsByLineageSource.set(evidence.lineageId, lineageWindows)
  }
  const assessmentByLineage = new Map(
    growthAssessments.map((assessment) => [assessment.lineageId, assessment]),
  )
  const evidenceWindowsByLineage: Record<string, NarrativeTalentGrowthEvidenceWindow[]> = {}
  const eligiblePatterns = promptPatterns.filter((pattern) => {
    const lineageHistory = growthByLineage.get(pattern.lineageId) ?? []
    if (lineageHistory.length >= TALENT_GROWTH_PER_LINEAGE_LIMIT) return false
    if (input.growthHistory.length >= TALENT_GROWTH_TOTAL_LIMIT) return false
    if (!(pattern.developmentStage in DESTINY_PATTERN_MINIMUM_EVIDENCE_WINDOWS)) return false
    const minimumWindows = DESTINY_PATTERN_MINIMUM_EVIDENCE_WINDOWS[
      pattern.developmentStage as Exclude<DestinyPatternDevelopmentStage, 'complete'>
    ]
    if (!Number.isFinite(minimumWindows)) return false
    const lastGrowth = lineageHistory.reduce<DestinyPatternGrowthHistoryEntry | undefined>(
      (latest, entry) => (!latest || entry.roundSequence > latest.roundSequence ? entry : latest),
      undefined,
    )
    const availableEvidenceWindows = [...(evidenceWindowsByLineageSource.get(pattern.lineageId)?.values() ?? [])]
      .sort((left, right) => left.round - right.round)
      .filter((window) => (
      !lastGrowth || window.round > lastGrowth.roundSequence
      ))
    if (availableEvidenceWindows.length < minimumWindows) return false
    const roundReady = !lastGrowth
      || input.currentRound - lastGrowth.roundSequence >= TALENT_GROWTH_COOLDOWN_ROUNDS
    const lastGrowthBasePoints = lastGrowth?.totalBasePoints
      ?? basePointsFromCalendarDays(lastGrowth?.totalDays ?? 0)
    const timeReady = !lastGrowth
      || totalBasePoints - lastGrowthBasePoints > TALENT_GROWTH_COOLDOWN_BASE_POINTS
    const assessment = assessmentByLineage.get(pattern.lineageId)
    const latestEvidenceRound = availableEvidenceWindows.reduce<number | undefined>(
      (latest, window) => Math.max(latest ?? 0, window.round),
      undefined,
    )
    const breakthroughReady = latestEvidenceRound !== undefined
      && (!assessment?.evaluatedBreakthroughRound
        || latestEvidenceRound > assessment.evaluatedBreakthroughRound)
    const eligible = roundReady
      && timeReady
      && breakthroughReady
    if (eligible) evidenceWindowsByLineage[pattern.lineageId] = availableEvidenceWindows
    return eligible
  })
  const history = input.compressedSummaries.summaries.flatMap((summary) => (
    summary.memoryEvents.map((event) => `${event.occurrenceTime}：${event.text}`)
  ))
  const sharedEvidenceRounds = new Set(Object.values(evidenceWindowsByLineage).flat().map((window) => window.round))
  const sharedEvidenceWindows = [...evidenceWindows.values()]
    .filter((window) => sharedEvidenceRounds.has(window.round))
    .sort((left, right) => left.round - right.round)
  const patterns = eligiblePatterns.map((pattern) => ({
    命格血脉编号: pattern.lineageId,
    当前版本: pattern.version,
    名称: pattern.name,
    分类: DESTINY_PATTERN_CATEGORY_CONFIG[pattern.category].label,
    资质阶位: DESTINY_PATTERN_APTITUDE_CONFIG[pattern.aptitudeTier].label,
    开发阶段: DESTINY_PATTERN_DEVELOPMENT_STAGE_CONFIG[pattern.developmentStage].label,
    详细介绍: pattern.description,
    效果描述: pattern.effect,
    当前完整属性加成: projectAttributeBonus(pattern.attrBonus),
    目标开发阶段: DESTINY_PATTERN_DEVELOPMENT_STAGE_CONFIG[
      getNextDestinyPatternDevelopmentStage(pattern.developmentStage)!
    ].label,
    允许属性: ['心智', '体魄', '魅力', '财富', '气运'],
    可用证据窗口编号: (evidenceWindowsByLineage[pattern.lineageId] ?? []).map((window) => window.id),
  }))
  const growthHistorySummary = input.growthHistory.map((entry) => ({
    天赋血脉编号: entry.lineageId,
    成长回合: entry.roundSequence,
    成长基础点: entry.totalBasePoints ?? basePointsFromCalendarDays(entry.totalDays),
    成长派生日历天数: entry.totalDays,
    结果名称: entry.result.name,
    结果资质阶位: DESTINY_PATTERN_APTITUDE_CONFIG[entry.result.aptitudeTier].label,
    结果开发阶段: DESTINY_PATTERN_DEVELOPMENT_STAGE_CONFIG[entry.result.developmentStage].label,
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
        当前基础点: totalBasePoints,
        当前派生日历天数: basePointsToCalendarDays(totalBasePoints),
        当前年龄: currentAge,
        证据窗口: sharedEvidenceWindows.map((window) => ({
          编号: window.id,
          时间: window.time,
          已成立事实: window.facts,
          ...(window.breakthrough ? { 突破契机: window.breakthrough } : {}),
        })),
        玩家已选天赋: patterns,
        天赋成长历史: growthHistorySummary,
        角色上下文: input.characterContext ?? {},
        世界上下文: input.worldContext ?? {},
      }),
    ],
    eligiblePatterns,
    evidenceWindowsByLineage,
    assessmentUpdates: eligiblePatterns.map((pattern) => {
      const windows = evidenceWindowsByLineage[pattern.lineageId] ?? []
      return {
        lineageId: pattern.lineageId,
        evaluatedThroughRound: windows.at(-1)?.round ?? input.currentRound,
        ...(windows.length === 0 ? {} : { evaluatedBreakthroughRound: windows.at(-1)!.round }),
      }
    }),
  }
}
