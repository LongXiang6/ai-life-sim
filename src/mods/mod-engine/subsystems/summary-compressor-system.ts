/**
 * Purpose: Compress completed narrative memory into weighted timeline summaries.
 * Owner: mod-engine
 * Responsibility: Compression scheduling and persistence handoff only; narrative authoring remains with the main AI.
 *
 * @module summary-compressor-system.ts
 * @description 叙事压缩系统 —— L1/L2/L3 四倍时间轴记忆管线
 * @mod mod-engine
 *
 * L1 覆盖 4 轮完整叙事，L2 覆盖 4 个 L1（16 轮），L3 覆盖 4 个 L2（64 轮）。
 * L1 延迟一个完整块：第 8 轮完成后压缩 1~4 轮，第 12 轮完成后压缩 5~8 轮，
 * 因而第 9/13 轮始终同时拥有已完成摘要和最近 4 轮结构化事实投影。
 */

import type {
  SubSystemState,
  SubSystemChanges,
  RoundContext,
  YearEvent,
  WorldSetting,
  CharacterState,
  CompressedSummaries,
  CompressedSummaryItem,
  CompressedMemoryEvent,
  AIModelConfig,
} from '@/foundation'
import { BaseSubsystem, callAI } from '@/core'

import {
  buildTimelineCompressionPrompt,
} from '../prompts/summary-prompt'
import {
  SUMMARY_INTERVAL,
  COMPRESS_L1_DELAY_BLOCKS,
  COMPRESS_L2_MERGE_COUNT,
  COMPRESS_L3_MERGE_COUNT,
  COMPRESS_L2_MERGE_INTERVAL,
  COMPRESS_L3_MERGE_INTERVAL,
} from '../constants'
import {
  TimelineCompressionOutputSchema,
  type TimelineSourceFact,
  buildCompressedMemoryEvents,
  compressedSummaryId,
  formatSummaryForPrompt,
  formatTimelineEvents,
  isMemoryEventActive,
  mapImportanceToMemoryWeight,
  coarseImportanceWeight,
} from '../helpers/timeline-memory'
import {
  buildRecentStoriesFromYearEvents,
  type RecentStoryProjection,
} from '../helpers/recent-story-context'
import {
  advanceNarrativeMemory,
  searchNarrativeMemory,
  syncNarrativeMemory,
} from '../helpers/narrative-memory-client'

import type { MemoryLifecycleSystem } from './memory-lifecycle-system'

export interface CompressionResult {
  newCompressedSummaries: CompressedSummaries
  newLatestSummary: string
  shouldShowSummary: boolean
  didCompress: boolean
}

export interface CompressionCandidate extends CompressionResult {
  completedRounds: number
  stats: CompressorStats
}

export interface CompressorConfig {
  l1TriggerCount: number
  l2TriggerCount: number
  l3TriggerCount: number
}

export interface CompressorStats {
  totalL1: number
  totalL2: number
  totalL3: number
  lastCompressionAt: number
}

interface SummarySourceGroup {
  startRound: number
  endRound: number
  childSummaries: CompressedSummaryItem[]
  sourceFacts: TimelineSourceFact[]
  permanentEvents: CompressedMemoryEvent[]
}

function normalizeLegacySummaries(input: CompressedSummaries | undefined): CompressedSummaries {
  const summaries = (input?.summaries ?? [])
    .filter((summary) => summary && Number.isFinite(summary.startRound) && Number.isFinite(summary.endRound))
    .map((summary) => ({
      ...summary,
      level: Math.max(1, Math.min(3, Number(summary.level))) as 1 | 2 | 3,
    }))
  return { summaries }
}

/**
 * 只让当前四倍时间轴边界参与新层级晋升。
 *
 * 旧存档可能在配置切换前留下 5 轮 L1（例如 1-5、6-10）。这些节点和
 * 原始明文档案必须保留，但不能与当前 4/16/64 轮边界混合，否则会让
 * 高层永远找不到连续的四个子节点。
 */
function isCurrentAlignedSummary(
  summary: Pick<CompressedSummaryItem, 'level' | 'startRound' | 'endRound'>,
  level: number = summary.level,
): boolean {
  const interval = level === 1
    ? SUMMARY_INTERVAL
    : level === 2
      ? COMPRESS_L2_MERGE_INTERVAL
      : COMPRESS_L3_MERGE_INTERVAL
  return summary.startRound >= 1
    && summary.endRound >= summary.startRound
    && summary.endRound - summary.startRound + 1 === interval
    && (summary.startRound - 1) % interval === 0
}

export class SummaryCompressorSystem extends BaseSubsystem {
  readonly id = 'summary-compressor' as const
  readonly mod = 'mod-engine' as const
  readonly label = '叙事压缩' as const
  readonly description = 'L1/L2/L3 四倍时间轴压缩与记忆归档' as const

  private compressedSummaries: CompressedSummaries = { summaries: [] }
  private stats: CompressorStats = {
    totalL1: 0,
    totalL2: 0,
    totalL3: 0,
    lastCompressionAt: 0,
  }

  getSummaries(): CompressedSummaries {
    return structuredClone(this.compressedSummaries)
  }

  getStats(): CompressorStats {
    return { ...this.stats }
  }

  restoreFromEngineState(
    summaries: CompressedSummaries | undefined,
    stats?: { l1Count?: number; l2Count?: number; l3Count?: number; lastAt?: number },
  ): void {
    this.compressedSummaries = normalizeLegacySummaries(summaries)
    const countLevel = (level: number) => this.compressedSummaries.summaries.filter((item) => item.level === level).length
    this.stats = {
      totalL1: stats?.l1Count ?? countLevel(1),
      totalL2: stats?.l2Count ?? countLevel(2),
      totalL3: stats?.l3Count ?? countLevel(3),
      lastCompressionAt: stats?.lastAt ?? 0,
    }
  }

  private buildL1SourceFacts(events: YearEvent[]): TimelineSourceFact[] {
    return events.flatMap((event) => {
      const facts: TimelineSourceFact[] = []
      const time = event.timeLabel || `${event.eraName}${event.eraYear}年`
      const maxImportance = event.keyEvents?.reduce(
        (max, keyEvent) => Math.max(max, Number(keyEvent.importance) || 0),
        0,
      ) ?? 0
      if (event.narrative?.trim()) {
        facts.push({
          id: `round-${event.id}:body`,
          round: event.id,
          time,
          text: `正文：${event.narrative}${event.digest ? `\n本轮摘要：${event.digest}` : ''}`,
          initialWeight: maxImportance > 0
            ? mapImportanceToMemoryWeight(maxImportance)
            : coarseImportanceWeight(event.importance),
          weightAnchorRound: event.id,
          permanent: maxImportance >= 90,
        })
      }
      for (const [index, keyEvent] of (event.keyEvents ?? []).entries()) {
        facts.push({
          id: `round-${event.id}:event-${index + 1}`,
          round: event.id,
          time,
          text: `${keyEvent.text}${keyEvent.entities?.length ? `（${keyEvent.entities.join('、')}）` : ''}`,
          initialWeight: mapImportanceToMemoryWeight(keyEvent.importance),
          weightAnchorRound: event.id,
          permanent: Number(keyEvent.importance) >= 90,
        })
      }
      if (facts.length === 0) {
        facts.push({
          id: `round-${event.id}:fallback`,
          round: event.id,
          time,
          text: event.narrative || event.digest || `第${event.id}轮无可提取正文`,
          initialWeight: coarseImportanceWeight(event.importance),
          weightAnchorRound: event.id,
          permanent: false,
        })
      }
      return facts
    })
  }

  private buildHigherLevelSourceGroup(
    level: 2 | 3,
    summaries: CompressedSummaryItem[],
  ): SummarySourceGroup | undefined {
    const childLevel = level - 1
    const covered = summaries
      .filter((summary) => summary.level === level)
      .filter((summary) => isCurrentAlignedSummary(summary, level))
      .map((summary) => ({ start: summary.startRound, end: summary.endRound }))
    const children = summaries
      .filter((summary) => summary.level === childLevel)
      .filter((summary) => isCurrentAlignedSummary(summary, childLevel))
      .filter((summary) => !covered.some((range) => (
        summary.startRound >= range.start && summary.endRound <= range.end
      )))
      .sort((a, b) => a.startRound - b.startRound)
    const count = level === 2 ? COMPRESS_L2_MERGE_COUNT : COMPRESS_L3_MERGE_COUNT
    for (let index = 0; index <= children.length - count; index++) {
      const candidate = children.slice(index, index + count)
      if (candidate.length !== count) continue
      const contiguous = candidate.every((summary, childIndex) => (
        childIndex === 0 || summary.startRound === candidate[childIndex - 1].endRound + 1
      ))
      if (!contiguous) continue
      const sourceFacts: TimelineSourceFact[] = []
      const permanentEvents: CompressedMemoryEvent[] = []
      for (const child of candidate) {
        const events = child.memoryEvents ?? [{
          id: `legacy:${child.level}:${child.startRound}-${child.endRound}`,
          timeSpan: `${child.startRound}-${child.endRound}轮`,
          text: child.content,
          occurrenceTime: `${child.startRound}-${child.endRound}轮`,
          sourceEventIds: [],
          sourceRounds: Array.from({ length: child.endRound - child.startRound + 1 }, (_, offset) => child.startRound + offset),
          initialWeight: 5,
          weightAnchorRound: child.startRound,
          permanent: false,
        } satisfies CompressedMemoryEvent]
        for (const event of events) {
          if (event.permanent || event.initialWeight >= 10) {
            permanentEvents.push(structuredClone({ ...event, permanent: true, initialWeight: 10 }))
            continue
          }
          if (!isMemoryEventActive(event, candidate.at(-1)!.endRound)) continue
          sourceFacts.push({
            id: event.id,
            round: Math.min(...event.sourceRounds, child.startRound),
            time: event.occurrenceTime,
            text: `${event.timeSpan}：${event.text}`,
            initialWeight: event.initialWeight,
            weightAnchorRound: event.weightAnchorRound,
            permanent: false,
          })
        }
      }
      return {
        startRound: candidate[0].startRound,
        endRound: candidate.at(-1)!.endRound,
        childSummaries: candidate,
        sourceFacts,
        permanentEvents,
      }
    }
    return undefined
  }

  private existingHistoryForPrompt(summaries: CompressedSummaryItem[], currentRound: number) {
    return summaries
      .sort((a, b) => a.startRound - b.startRound || a.level - b.level)
      .map((summary) => ({
        level: summary.level,
        startRound: summary.startRound,
        endRound: summary.endRound,
        content: formatSummaryForPrompt(summary, currentRound),
      }))
  }

  private async compressGroup(
    level: 1 | 2 | 3,
    group: SummarySourceGroup,
    config: AIModelConfig,
    world: WorldSetting,
    character: CharacterState,
    summarySessionId: string,
    routeOpts: { providerId?: string; customBaseUrl?: string; customModel?: string },
    customKey: string | undefined,
    allSummaries: CompressedSummaryItem[],
    createdRound: number,
    recentStories: readonly RecentStoryProjection[],
    signal?: AbortSignal,
  ): Promise<CompressedSummaryItem> {
    const sourceFacts = group.sourceFacts
    let rawCompressionResponse = ''
    let memoryEvents: CompressedMemoryEvent[] = [...group.permanentEvents]

    if (sourceFacts.length > 0) {
      const { system, user } = buildTimelineCompressionPrompt({
        level,
        character,
        world,
        sourceFacts,
        recentStories,
        existingCompressedHistory: this.existingHistoryForPrompt(allSummaries, createdRound),
      })
      rawCompressionResponse = await callAI(system, user, {
        config,
        pool: 'summary',
        sessionId: summarySessionId,
        storySeed: summarySessionId,
        apiKey: customKey,
        ...routeOpts,
        overrideTemperature: 0,
        overrideTopP: 1,
        jsonMode: true,
        outputSchema: TimelineCompressionOutputSchema,
        strictSchema: true,
        reasoningEffort: 'disabled',
        signal,
        logContext: {
          callKind: `summary-compress-L${level}`,
          round: group.endRound,
          sessionId: summarySessionId,
        },
      })
      const parsed = TimelineCompressionOutputSchema.parse(JSON.parse(rawCompressionResponse))
      const expectedIds = new Set(sourceFacts.map((source) => source.id))
      const coveredIds = new Set(parsed.periods.flatMap((period) => period.events.flatMap((event) => event.sourceIds)))
      for (const id of expectedIds) {
        if (!coveredIds.has(id)) throw new Error(`L${level} 压缩缺少来源覆盖：${id}`)
      }
      if ([...coveredIds].some((id) => !expectedIds.has(id))) {
        throw new Error(`L${level} 压缩引用了未知来源事件`)
      }
      memoryEvents = [
        ...memoryEvents,
        ...buildCompressedMemoryEvents(level, group.startRound, group.endRound, parsed, sourceFacts),
      ]
    }

    const summaryId = compressedSummaryId(level, group.startRound, group.endRound)
    return {
      level,
      startRound: group.startRound,
      endRound: group.endRound,
      createdRound,
      content: formatTimelineEvents(memoryEvents, createdRound),
      archiveContent: formatTimelineEvents(memoryEvents, createdRound, { includeInactive: true }),
      memoryEvents,
      rawCompressionResponse: rawCompressionResponse || '{"completionMarker":"LOCAL_NO_COMPRESSIBLE_MEMORY"}',
      sourceSummaryIds: group.childSummaries.map((summary) => compressedSummaryId(summary.level, summary.startRound, summary.endRound)),
      ...this.scopeFromSummaries(group.childSummaries),
      // The stable node ID is included in sourceSummaryIds-compatible metadata by the DB client.
      ...(summaryId ? {} : {}),
    }
  }

  private scopeFromEvents(items: YearEvent[]): Pick<CompressedSummaryItem, 'contextIds' | 'startTotalDays' | 'endTotalDays'> {
    const contextIds = [...new Set(items.map((item) => item.contextId).filter((id): id is string => Boolean(id)))]
    const days = items.map((item) => item.totalDays).filter((value): value is number => typeof value === 'number')
    return {
      ...(contextIds.length ? { contextIds } : {}),
      ...(days.length ? { startTotalDays: Math.min(...days), endTotalDays: Math.max(...days) } : {}),
    }
  }

  private scopeFromSummaries(items: CompressedSummaryItem[]): Pick<CompressedSummaryItem, 'contextIds' | 'startTotalDays' | 'endTotalDays'> {
    const contextIds = [...new Set(items.flatMap((item) => item.contextIds ?? []))]
    const starts = items.map((item) => item.startTotalDays).filter((value): value is number => typeof value === 'number')
    const ends = items.map((item) => item.endTotalDays).filter((value): value is number => typeof value === 'number')
    return {
      ...(contextIds.length ? { contextIds } : {}),
      ...(starts.length ? { startTotalDays: Math.min(...starts) } : {}),
      ...(ends.length ? { endTotalDays: Math.max(...ends) } : {}),
    }
  }

  needsCompression(events: YearEvent[], turnCount: number): boolean {
    const completedRounds = turnCount + 1
    if (completedRounds <= 0) return false

    const summaries = normalizeLegacySummaries(this.compressedSummaries).summaries
    const latestEligibleBlock = Math.floor(completedRounds / SUMMARY_INTERVAL)
      - 1
      - COMPRESS_L1_DELAY_BLOCKS
    for (let block = 0; block <= latestEligibleBlock; block++) {
      const startRound = block * SUMMARY_INTERVAL + 1
      const endRound = (block + 1) * SUMMARY_INTERVAL
      if (summaries.some((summary) => (
        summary.level === 1
        && summary.startRound === startRound
        && summary.endRound === endRound
      ))) continue
      const blockEventCount = events.filter((event) => (
        event.id >= startRound && event.id <= endRound
      )).length
      if (blockEventCount >= SUMMARY_INTERVAL) return true
      break
    }

    return this.buildHigherLevelSourceGroup(2, summaries) !== undefined
      || this.buildHigherLevelSourceGroup(3, summaries) !== undefined
  }

  async createCompressionCandidate(
    config: AIModelConfig,
    events: YearEvent[],
    world: WorldSetting,
    character: CharacterState,
    turnCount: number,
    _resolvedBranches?: Record<number, string>,
    storySeed?: string,
    _memoryLifecycle?: MemoryLifecycleSystem,
    _lifeRunId?: string,
    signal?: AbortSignal,
  ): Promise<CompressionCandidate> {
    const { useSettingsStore } = await import('@/mods/mod-settings/settings-runtime-api')
    const { customKey, provider, customUrl, customModel } = useSettingsStore.getState()
    const model = customModel || config.model
    const routeOpts = { providerId: provider, customBaseUrl: customUrl || undefined, customModel: model }
    const aiConfig = { ...config, model }
    const summarySessionId = storySeed ?? world.name.replace(/\s+/g, '-').slice(0, 32)
    const completedRounds = turnCount + 1
    if (completedRounds <= 0) {
      return {
        newCompressedSummaries: structuredClone(this.compressedSummaries),
        newLatestSummary: '',
        shouldShowSummary: false,
        didCompress: false,
        completedRounds,
        stats: this.getStats(),
      }
    }

    let summaries = normalizeLegacySummaries(this.compressedSummaries).summaries
    const nextStats = this.getStats()
    const recentStories = buildRecentStoriesFromYearEvents(events)
    let didCompress = false
    let newLatestSummary = ''
    let shouldShowSummary = false
    const append = (summary: CompressedSummaryItem) => {
      summaries = [...summaries, summary]
      didCompress = true
      if (summary.level === 1) {
        newLatestSummary = summary.content
        shouldShowSummary = true
      }
      nextStats[`totalL${summary.level}` as 'totalL1' | 'totalL2' | 'totalL3']++
    }

    // 延迟一个 L1 块，完成 8 轮时目标块为 1~4，完成 12 轮时目标块为 5~8。
    const latestEligibleBlock = Math.floor(completedRounds / SUMMARY_INTERVAL) - 1 - COMPRESS_L1_DELAY_BLOCKS
    for (let block = 0; block <= latestEligibleBlock; block++) {
      const startRound = block * SUMMARY_INTERVAL + 1
      const endRound = (block + 1) * SUMMARY_INTERVAL
      // 只按完整边界去重。旧的 5 轮节点可能与当前 4 轮窗口同起点，
      // 但不能阻止补建当前边界的 L1。
      if (summaries.some((summary) => (
        summary.level === 1
        && summary.startRound === startRound
        && summary.endRound === endRound
      ))) continue
      const blockEvents = events.filter((event) => event.id >= startRound && event.id <= endRound)
      if (blockEvents.length < SUMMARY_INTERVAL) break
      const group: SummarySourceGroup = {
        startRound,
        endRound,
        childSummaries: [],
        sourceFacts: this.buildL1SourceFacts(blockEvents),
        permanentEvents: [],
      }
      try {
        append(await this.compressGroup(
          1,
          group,
          aiConfig,
          world,
          character,
          summarySessionId,
          routeOpts,
          customKey || undefined,
          summaries,
          completedRounds,
          recentStories,
          signal,
        ))
      } catch (error) {
        throw new Error('L1 压缩候选生成失败', { cause: error })
      }
    }

    for (const level of [2, 3] as const) {
      const group = this.buildHigherLevelSourceGroup(level, summaries)
      if (!group) continue
      try {
        append(await this.compressGroup(
          level,
          group,
          aiConfig,
          world,
          character,
          summarySessionId,
          routeOpts,
          customKey || undefined,
          summaries,
          completedRounds,
          recentStories,
          signal,
        ))
      } catch (error) {
        throw new Error(`L${level} 压缩候选生成失败`, { cause: error })
      }
    }

    if (didCompress) nextStats.lastCompressionAt = Date.now()

    return {
      newCompressedSummaries: structuredClone({ summaries }),
      newLatestSummary,
      shouldShowSummary,
      didCompress,
      completedRounds,
      stats: nextStats,
    }
  }

  async commitCompressionCandidate(
    candidate: CompressionCandidate,
    lifeRunId?: string,
  ): Promise<void> {
    this.compressedSummaries = normalizeLegacySummaries(candidate.newCompressedSummaries)
    this.stats = { ...candidate.stats }

    if (!lifeRunId) return
    try {
      if (candidate.didCompress) {
        await syncNarrativeMemory({
          lifeRunId,
          currentRound: candidate.completedRounds,
          summaries: this.compressedSummaries.summaries,
        })
      } else {
        await advanceNarrativeMemory(lifeRunId, candidate.completedRounds)
      }
    } catch (error) {
      console.error('[SummaryCompressor] 存档记忆数据库同步失败，内存状态保留并将在下一轮重试:', error)
    }
  }

  async searchMemory(
    lifeRunId: string,
    currentRound: number,
    terms: readonly string[],
  ) {
    return searchNarrativeMemory(lifeRunId, currentRound, terms)
  }

  collectState(_context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: `【${this.label}】L1:${this.stats.totalL1} L2:${this.stats.totalL2} L3:${this.stats.totalL3}`,
      data: structuredClone({ stats: this.stats, summaries: this.compressedSummaries }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') throw new Error(`[${this.id}] Invalid changes: expected object`)
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`)
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected object`)
    }
    if (!changes.description || changes.description.trim() === '') throw new Error(`[${this.id}] Missing changes.description`)
  }

  reset(): void {
    this.compressedSummaries = { summaries: [] }
    this.stats = { totalL1: 0, totalL2: 0, totalL3: 0, lastCompressionAt: 0 }
  }
}

export const summaryCompressor = new SummaryCompressorSystem()
