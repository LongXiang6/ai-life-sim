/**
 * @module world-timeline-system.ts
 * @description 世界时间线子系统 —— 阶段分割 + 滑动窗口 ±1 + 事件查询 + AI 填充 + 过去历史
 * @mod mod-world
 *
 * 旧项目参考：world-timeline-system.ts（即 world-timeline-bridge.ts）
 * 设计理念：骨架→填充 两阶段模式
 *   Phase 1: 本地算法生成骨架节点（year/impact/triggerRange，标题占位）
 *   Phase 2: AI fire-and-forget 异步填充实际事件描述
 *
 * v3.0 升级：9 级影响级别 + 25 种事件类型 + 世界观风格提示（对齐废弃项目）
 * v3.1 升级：无限滑动生成（无总跨度上限）+ 过去历史事件生成
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { saveStore } from '@/core'
import { clamp } from '@/core/shared'

import {
  STAGE_SPAN,
  WINDOW_RADIUS,
  SEGMENTS_PER_STAGE,
  BATCH_SEGMENTS,
  IMPACT_LEVELS,
  IMPACT_LEVEL_CONFIGS,
  worldTimelinePrompt,
  pastHistoryPrompt,
  parseAIJSON,
  getStageIndex,
  STRATEGY_IMPACT_MULTIPLIERS,
  getEventDistributionStrategy,
  getImpactRangeModifier,
  buildTimelineStyleHint,
  resolveWorldviewStyleHint,
  type TimelineEvent,
  type StageMeta,
  type WorldTimelineInternalState,
  type ImpactLevel,
  type WorldTimelineEventType,
  type EventDistributionStrategy,
} from '../world-timeline-deps'

import { useWorldStore } from '../store'
import {
  buildCoherenceRetryHint,
  detectCoherenceViolations,
  normalizePastHistoryYear,
  resolvePastHistoryYearRange,
} from '../utils/world-coherence-output-guard'

export { getStageIndex } from '../utils/stage-index'

// ========== 确定性伪随机 ==========

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function weightedPick<T>(items: T[], weights: number[], rand: () => number): T {
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  if (totalWeight <= 0) return items[0]
  let r = rand() * totalWeight
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

// ========== 9 级影响级别门控 + 概率分布（对齐废弃项目 v3.0） ==========

/** 根据年份返回当前可用影响级别列表 */
function getAvailableImpacts(year: number): ImpactLevel[] {
  return IMPACT_LEVELS.filter(
    (level) => IMPACT_LEVEL_CONFIGS[level].unlockYear <= Math.abs(year),
  )
}

/** 根据年份计算各等级概率权重，返回加权随机选中的影响级别 */
function pickImpactForYear(
  year: number,
  rand: () => number,
  strategy: EventDistributionStrategy = 'balanced',
): ImpactLevel {
  const effectiveYear = Math.abs(year)
  const available = getAvailableImpacts(year)

  const weights: Record<ImpactLevel, number> = {
    trivial: 0, minor: 0, local: 0, regional: 0,
    national: 0, continental: 0, world: 0, cosmic: 0, infinite: 0,
  }

  if (effectiveYear < 1000) {
    weights.trivial = 35
    weights.minor = 30
    weights.local = 20
    weights.regional = 15
  } else if (effectiveYear < 2000) {
    weights.trivial = 25
    weights.minor = 25
    weights.local = 18
    weights.regional = 15
    weights.national = 12
    weights.continental = 5
  } else if (effectiveYear < 50000) {
    weights.trivial = 18
    weights.minor = 20
    weights.local = 18
    weights.regional = 15
    weights.national = 15
    weights.continental = 14
  } else if (effectiveYear < 100000) {
    weights.trivial = 8
    weights.minor = 12
    weights.local = 15
    weights.regional = 15
    weights.national = 15
    weights.continental = 15
    weights.world = 20
  } else if (effectiveYear < 500000) {
    weights.trivial = 5
    weights.minor = 8
    weights.local = 10
    weights.regional = 12
    weights.national = 12
    weights.continental = 15
    weights.world = 18
    weights.cosmic = 20
  } else {
    weights.trivial = 3
    weights.minor = 5
    weights.local = 7
    weights.regional = 10
    weights.national = 10
    weights.continental = 15
    weights.world = 18
    weights.cosmic = 22
    weights.infinite = 10
  }

  const strategyMult = STRATEGY_IMPACT_MULTIPLIERS[strategy] ?? {}
  for (const level of IMPACT_LEVELS) {
    const mult = strategyMult[level]
    if (mult !== undefined && weights[level] > 0) {
      weights[level] = weights[level] * mult
    }
  }

  const filtered: ImpactLevel[] = []
  const filteredWeights: number[] = []
  for (const level of available) {
    const w = weights[level]
    if (w > 0) {
      filtered.push(level)
      filteredWeights.push(w)
    }
  }

  if (filtered.length === 0) return 'local'
  return weightedPick(filtered, filteredWeights, rand)
}

/** 按 calibration.eventTypeWeights 加权采样事件类型；无权重时均匀随机 */
function pickWeightedEventType(
  rng: () => number,
  weights: Record<string, number> | undefined,
): WorldTimelineEventType {
  if (!weights || Object.keys(weights).length === 0) {
    return EVENT_TYPES[Math.floor(rng() * EVENT_TYPES.length)]
  }

  const items: WorldTimelineEventType[] = []
  const itemWeights: number[] = []
  for (const eventType of EVENT_TYPES) {
    const w = weights[eventType]
    if (w !== undefined && w > 0) {
      items.push(eventType)
      itemWeights.push(w)
    }
  }

  if (items.length === 0) {
    return EVENT_TYPES[Math.floor(rng() * EVENT_TYPES.length)]
  }

  return weightedPick(items, itemWeights, rng)
}

/** 查表获取影响级别的触发范围（含校准 modifier） */
function getTriggerRangeForImpact(impact: ImpactLevel, impactRangeModifier = 1.0): number {
  const base = IMPACT_LEVEL_CONFIGS[impact]?.triggerRange ?? 500
  return Math.max(1, Math.round(base * impactRangeModifier))
}

// 25 种事件类型（对齐废弃项目）
const EVENT_TYPES: WorldTimelineEventType[] = [
  'rise', 'fall', 'founding', 'war', 'disaster', 'discovery',
  'crisis', 'transformation', 'age', 'conquest', 'schism',
  'golden_age', 'dark_age', 'renaissance', 'plague', 'rebellion',
  'world_war', 'cosmic_calamity', 'cataclysm',
  'spiritual_revival', 'heavenly_mutation', 'end_of_fa',
  'breakthrough', 'prophecy', 'incursion', 'extinction', 'exodus', 'celestial',
]

/** 生成单个阶段的骨架事件节点（9 级影响 + 年份门控） */
function generateSkeletonEvents(
  seed: number,
  stageIndex: number,
  startingYear: number,
): TimelineEvent[] {
  const calibration = useWorldStore.getState().calibration
  const strategy = getEventDistributionStrategy(calibration)
  const impactRangeMod = getImpactRangeModifier(calibration)
  const rng = mulberry32(seed + stageIndex * 1000)
  const count = 20 + Math.floor(rng() * 20)

  const stageStart = startingYear + stageIndex * STAGE_SPAN
  const events: TimelineEvent[] = []

  for (let i = 0; i < count; i++) {
    const year = Math.round(stageStart + i * (STAGE_SPAN / count) + (rng() - 0.5) * (STAGE_SPAN / count))
    const impact = pickImpactForYear(year, rng, strategy)
    const triggerRange = getTriggerRangeForImpact(impact, impactRangeMod)
    const type = pickWeightedEventType(rng, calibration?.styleGuide?.eventTypeWeights)

    events.push({
      id: `stage-${stageIndex}-event-${i}`,
      year,
      title: '⏳ 命运之轮',
      description: '重大事件即将降临，命运之轮正在转动...',
      impact,
      type,
      triggerRange: [Math.round(year - triggerRange), Math.round(year + triggerRange)],
      filled: false,
      tier: 'L1',
    })
  }

  return events.sort((a, b) => a.year - b.year)
}

/** 生成上古史骨架节点（负年份，纪元之前） */
function generatePastHistorySkeleton(
  seed: number,
  count: number,
  minYear: number,
  maxYear: number,
): TimelineEvent[] {
  const calibration = useWorldStore.getState().calibration
  const strategy = getEventDistributionStrategy(calibration)
  const impactRangeMod = getImpactRangeModifier(calibration)
  const rng = mulberry32(seed + 888888)
  const span = maxYear - minYear
  const events: TimelineEvent[] = []

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / Math.max(1, count - 1)
    const jitter = (rng() - 0.5) * (Math.abs(span) / Math.max(count, 1)) * 0.4
    const year = Math.round(minYear + t * span + jitter)
    const impact = pickImpactForYear(year, rng, strategy)
    const triggerRange = getTriggerRangeForImpact(impact, impactRangeMod)
    const type = pickWeightedEventType(rng, calibration?.styleGuide?.eventTypeWeights)

    events.push({
      id: `past-history-skeleton-${i}`,
      year,
      title: '⏳ 上古秘辛',
      description: '远古时代的重大变故，正等待被揭示...',
      impact,
      type,
      triggerRange: [Math.round(year - triggerRange), Math.round(year + triggerRange)],
      filled: false,
      tier: 'L1',
    })
  }

  return events.sort((a, b) => a.year - b.year)
}

// ========== 存储辅助（saveStore） ==========

function saveStage(worldCode: number, stageIndex: number, events: TimelineEvent[]): void {
  if (typeof window === 'undefined') return
  try {
    saveStore.set('mod-world', 0, `timeline-stage:${worldCode}:${stageIndex}`, events)
  } catch (_error) {
    // console.warn('world-timeline: 阶段数据写入失败', _error)
  }
}

function loadStage(worldCode: number, stageIndex: number): TimelineEvent[] | null {
  if (typeof window === 'undefined') return null
  try {
    return saveStore.get<TimelineEvent[]>('mod-world', 0, `timeline-stage:${worldCode}:${stageIndex}`)
  } catch {
    return null
  }
}

function deleteStage(worldCode: number, stageIndex: number): void {
  if (typeof window === 'undefined') return
  try {
    saveStore.remove('mod-world', 0, `timeline-stage:${worldCode}:${stageIndex}`)
  } catch (_error) {
    // console.warn('world-timeline: 阶段数据删除失败', _error)
  }
}

function saveStageMeta(worldCode: number, metas: Record<number, StageMeta>): void {
  if (typeof window === 'undefined') return
  try {
    saveStore.set('mod-world', 0, `timeline-meta:${worldCode}`, metas)
  } catch (_error) {
    // console.warn('world-timeline: 阶段元数据写入失败', _error)
  }
}

function loadStageMeta(worldCode: number): Record<number, StageMeta> {
  if (typeof window === 'undefined') return {}
  try {
    return saveStore.get<Record<number, StageMeta>>('mod-world', 0, `timeline-meta:${worldCode}`) ?? {}
  } catch {
    return {}
  }
}

function savePastHistory(worldCode: number, events: TimelineEvent[]): void {
  if (typeof window === 'undefined') return
  try {
    saveStore.set('mod-world', 0, `past-history:${worldCode}`, events)
  } catch (_error) {
    // console.warn('world-timeline: 过去历史写入失败', _error)
  }
}

function loadPastHistory(worldCode: number): TimelineEvent[] | null {
  if (typeof window === 'undefined') return null
  try {
    return saveStore.get<TimelineEvent[]>('mod-world', 0, `past-history:${worldCode}`)
  } catch {
    return null
  }
}

// ========== 子系统主体 ==========

export class WorldTimelineSystem implements ISubSystem {
  readonly id = 'world-timeline' as const
  readonly mod = 'mod-world' as const
  readonly label = '世界时间线' as const
  readonly description = '管理世界历史：阶段分割 + 滑动窗口 ±1 + 骨架生成 + AI 填充 + 事件查询 + 过去历史（v3.1：无限滑动+上古史）' as const

  private state: WorldTimelineInternalState = {
    worldCode: 0,
    seed: 0,
    currentStage: 0,
    activeStages: {},
    stageMetas: {},
    maxGeneratedStage: 1,
    pastHistoryEvents: [],
  }

  /** 世界观标签（用于 AI 风格提示） */
  private essenceTag: string = ''

  /** 世界名称（用于 AI prompt） */
  private worldName: string = ''

  /** 世界描述（用于 AI prompt） */
  private worldDescription: string = ''

  /** 文明阶段（用于 AI prompt） */
  private civilizationStage: string = ''

  /** 文明一致性约束（用于 AI prompt） */
  private coherenceHint: string = ''
  private coherenceNote: string = ''
  private worldType: string = 'idealist'

  /** 时间线起始锚点年份（来自世界配置 eraStartYear） */
  private anchorYear: number = 0

  /** AI 服务函数（用于时间线填充） */
  private callAI: ((prompt: string, extraUserMessages?: string[]) => Promise<string>) | null = null

  /** 过去史专用 AI 服务（独立 system prompt + budget） */
  private pastHistoryCallAI: ((prompt: string) => Promise<string>) | null = null
  private pastHistoryStyleHint: string = ''

  /** 段索引缓存：stageIndex → { segmentIndex → TimelineEvent[] }，用于加速事件查询 */
  private segmentIndexes: Record<number, Record<number, TimelineEvent[]>> = {}

  // ========== AI 服务注入 ==========

  setAIService(callAI: (prompt: string, extraUserMessages?: string[]) => Promise<string>): void {
    this.callAI = callAI
  }

  /** 注入过去史 AI 服务（使用 pastHistoryPrompt.systemPrompt，与 fillStage 分离） */
  setPastHistoryAIService(
    callAI: (prompt: string, extraUserMessages?: string[]) => Promise<string>,
    worldviewStyleHint: string,
  ): void {
    this.pastHistoryCallAI = callAI
    this.pastHistoryStyleHint = worldviewStyleHint
  }

  /** 维度推断后更新世界观上下文（essenceTag / civilizationStage / worldType 等） */
  updateWorldviewContext(opts: {
    essenceTag?: string
    civilizationStage?: string
    worldType?: string
    worldDescription?: string
  }): void {
    if (opts.essenceTag !== undefined) this.essenceTag = opts.essenceTag
    if (opts.civilizationStage !== undefined) this.civilizationStage = opts.civilizationStage
    if (opts.worldType !== undefined) this.worldType = opts.worldType
    if (opts.worldDescription !== undefined) this.worldDescription = opts.worldDescription
  }

  hasAIService(): boolean {
    return this.callAI !== null
  }

  // ========== 初始化 ==========

  init(
    worldCode: number,
    seed: number,
    essenceTag?: string,
    worldName?: string,
    worldDescription?: string,
    startingYear?: number,
    civilizationStage?: string,
    coherenceHint?: string,
    coherenceNote?: string,
    worldType?: string,
  ): void {
    this.state.worldCode = worldCode
    this.state.seed = seed
    this.essenceTag = essenceTag ?? ''
    this.worldName = worldName ?? ''
    this.worldDescription = worldDescription ?? ''
    this.civilizationStage = civilizationStage ?? ''
    this.coherenceHint = coherenceHint ?? ''
    this.coherenceNote = coherenceNote ?? ''
    this.worldType = worldType ?? 'idealist'
    this.state.stageMetas = loadStageMeta(worldCode)

    const anchorYear = startingYear ?? 0
    this.anchorYear = anchorYear

    // 加载过去历史缓存
    const cachedPast = loadPastHistory(worldCode)
    if (cachedPast) {
      this.state.pastHistoryEvents = cachedPast
    }

    // 生成初始阶段 0 + 1
    for (let s = 0; s <= 1; s++) {
      this.generateStageSkeleton(s, anchorYear)
    }
    this.state.maxGeneratedStage = 1
  }

  // ========== 阶段管理 ==========

  ensureStagesLoaded(year: number): void {
    const currentStage = getStageIndex(year, this.anchorYear)
    if (currentStage === this.state.currentStage) return

    this.state.currentStage = currentStage

    // 自动扩展：如果当前阶段超出已生成范围，按需生成新阶段
    while (currentStage + WINDOW_RADIUS > this.state.maxGeneratedStage) {
      const nextStage = this.state.maxGeneratedStage + 1
      this.generateStageSkeleton(nextStage, this.anchorYear)
      this.state.maxGeneratedStage = nextStage
    }

    // 加载窗口内阶段
    for (let s = currentStage - WINDOW_RADIUS; s <= currentStage + WINDOW_RADIUS; s++) {
      if (s < 0) continue
      if (!this.state.activeStages[s]) {
        const cached = loadStage(this.state.worldCode, s)
        if (cached) {
          this.state.activeStages[s] = cached
          this.buildSegmentIndex(s, cached)
        } else {
          this.generateStageSkeleton(s, this.anchorYear)
          this.state.maxGeneratedStage = Math.max(this.state.maxGeneratedStage, s)
        }
      }
    }

    // 卸载遥远阶段
    const unloadThreshold = currentStage - WINDOW_RADIUS - 1
    const stageKeys = Object.keys(this.state.activeStages).map(Number)
    for (const stageIdx of stageKeys) {
      if (stageIdx < unloadThreshold) {
        this.unloadStage(stageIdx)
      }
    }
  }

  /** 生成阶段骨架（本地算法，无 AI 调用） */
  generateStageSkeleton(stageIndex: number, anchorYear: number = 0): TimelineEvent[] {
    if (stageIndex < 0) return []

    const events = generateSkeletonEvents(
      this.state.seed,
      stageIndex,
      anchorYear,
    )

    this.state.activeStages[stageIndex] = events

    // 构建段索引（每段 100 年，共 100 段/阶段）
    this.buildSegmentIndex(stageIndex, events)

    // 更新元数据
    this.state.stageMetas[stageIndex] = {
      stageIndex,
      startingYear: anchorYear + stageIndex * STAGE_SPAN,
      totalEvents: events.length,
      filledEvents: 0,
      complete: false,
    }

    // 持久化
    saveStage(this.state.worldCode, stageIndex, events)
    saveStageMeta(this.state.worldCode, this.state.stageMetas)

    return events
  }

  /** 卸载远后阶段 */
  private unloadStage(stageIndex: number): void {
    if (this.state.activeStages[stageIndex]) {
      deleteStage(this.state.worldCode, stageIndex)
      delete this.state.activeStages[stageIndex]
      delete this.segmentIndexes[stageIndex]
    }
  }

  /** 为指定阶段构建段索引（每段 100 年，共 100 段/阶段） */
  private buildSegmentIndex(stageIndex: number, events: TimelineEvent[]): void {
    const stageStart = this.anchorYear + stageIndex * STAGE_SPAN
    const segmentSize = STAGE_SPAN / SEGMENTS_PER_STAGE
    const segMap: Record<number, TimelineEvent[]> = {}

    for (const evt of events) {
      const segIdx = Math.floor((evt.year - stageStart) / segmentSize)
      const clampedIdx = clamp(segIdx, 0, SEGMENTS_PER_STAGE - 1)
      if (!segMap[clampedIdx]) segMap[clampedIdx] = []
      segMap[clampedIdx].push(evt)
    }

    this.segmentIndexes[stageIndex] = segMap
  }

  // ========== AI 填充 ==========

  private get batchYearSpan(): number {
    return BATCH_SEGMENTS * (STAGE_SPAN / SEGMENTS_PER_STAGE)
  }

  private get totalBatches(): number {
    return Math.ceil(SEGMENTS_PER_STAGE / BATCH_SEGMENTS)
  }

  /**
   * AI 填充指定阶段的指定批次（默认只填第0批，对齐废弃项目按需渐进填充策略）
   */
  async fillStageWithAI(stageIndex: number, batchToFill: number = 0): Promise<void> {
    if (!this.callAI) return

    const stageEvents = this.state.activeStages[stageIndex]
    if (!stageEvents) return

    const placeholderEvents = stageEvents.filter((e) => !e.filled)
    if (placeholderEvents.length === 0) return

    placeholderEvents.sort((a, b) => a.year - b.year)

    const stageStart = this.anchorYear + stageIndex * STAGE_SPAN
    const totalBatches = this.totalBatches
    const prevStageSummary = stageIndex > 0
      ? `第 ${stageIndex - 1} 阶段（${this.anchorYear + (stageIndex - 1) * STAGE_SPAN} - ${this.anchorYear + stageIndex * STAGE_SPAN - 1} 年）`
      : ''

    const startBatch = batchToFill >= 0 ? batchToFill : 0
    const endBatch = batchToFill >= 0 ? batchToFill + 1 : totalBatches

    // 世界观风格提示（优先 Step 0 calibration.styleGuide）
    const cal = useWorldStore.getState().calibration
    const worldviewStyleHint = buildTimelineStyleHint(
      this.civilizationStage,
      this.worldDescription,
      resolveWorldviewStyleHint({
        cal,
        essenceTag: this.essenceTag,
        worldDescription: this.worldDescription,
        worldType: this.worldType,
      }),
      cal,
      this.worldType,
      this.essenceTag,
    )

    for (let batchIdx = startBatch; batchIdx < endBatch && batchIdx < totalBatches; batchIdx++) {
      const batchStartYear = stageStart + batchIdx * this.batchYearSpan
      const batchEndYear = Math.min(
        batchStartYear + this.batchYearSpan - 1,
        stageStart + STAGE_SPAN - 1,
      )

      const batchUnfilled = placeholderEvents.filter(
        (e) => e.year >= batchStartYear && e.year <= batchEndYear,
      )
      if (batchUnfilled.length === 0) continue

      const skeletonText = batchUnfilled.map((e) =>
        `- [${e.year}年] 影响级别：${e.impact}，类型：${e.type}`
      ).join('\n')

      const prompt = worldTimelinePrompt.userPromptTemplate
        .replace('{{worldName}}', this.worldName)
        .replace('{{essenceTag}}', this.essenceTag)
        .replace('{{powerSystemTag}}', '')
        .replace('{{civilizationStage}}', this.civilizationStage)
        .replace('{{worldDescription}}', this.worldDescription)
        .replace('{{coherenceHint}}', this.coherenceHint)
        .replace('{{coherenceNote}}', this.coherenceNote)
        .replace('{{worldType}}', this.worldType)
        .replace('{{stageIndex}}', String(stageIndex))
        .replace('{{stageSpan}}', String(STAGE_SPAN))
        .replace('{{stageStartYear}}', String(batchStartYear))
        .replace('{{stageEndYear}}', String(batchEndYear))
        .replace('{{previousStageSummary}}', prevStageSummary)
        .replace('{{skeletonEvents}}', skeletonText)
        .replace('{{worldviewStyleHint}}', worldviewStyleHint)

      console.log(
        `[world-timeline] 阶段 ${stageIndex} 批次 ${batchIdx + 1}/${totalBatches}: ` +
        `填充 ${batchUnfilled.length} 个事件 (${batchStartYear}~${batchEndYear}年)`,
      )

      try {
        const response = await this.callAI(prompt)
        if (!response || response.trim() === '' || response.trim() === '无') {
          console.warn(`[world-timeline] 批次 ${batchIdx + 1}: AI 返回空`)
          continue
        }

        const parsed = parseAIJSON<Array<{
          year?: number; title?: string; description?: string; impact?: string; type?: string
          chainEffects?: string[]; involvedFactions?: string[]
        }>>(response)
        if (!parsed) {
          console.warn(`[world-timeline] 批次 ${batchIdx + 1}: AI 响应无法解析为 JSON`)
          continue
        }

        if (!Array.isArray(parsed) || parsed.length === 0) {
          console.warn(`[world-timeline] 批次 ${batchIdx + 1}: AI 返回空数组`)
          continue
        }

        let matchedCount = 0
        for (const aiEvent of parsed) {
          let target: TimelineEvent | undefined
          if (aiEvent.year !== undefined) {
            target = batchUnfilled.find((e) => e.year === aiEvent.year)
          }
          if (!target) {
            target = batchUnfilled[matchedCount]
          }
          if (!target) continue

          if (aiEvent.title) target.title = aiEvent.title
          if (aiEvent.description) target.description = aiEvent.description
          if (aiEvent.impact) target.impact = aiEvent.impact as ImpactLevel
          if (aiEvent.type) target.type = aiEvent.type as WorldTimelineEventType
          if (aiEvent.chainEffects) target.chainEffects = aiEvent.chainEffects
          if (aiEvent.involvedFactions) target.involvedFactions = aiEvent.involvedFactions
          target.filled = true
          matchedCount++
        }

        const filledCount = stageEvents.filter((e) => e.filled).length
        this.state.stageMetas[stageIndex] = {
          ...this.state.stageMetas[stageIndex],
          filledEvents: filledCount,
          complete: filledCount >= stageEvents.length,
        }

        saveStage(this.state.worldCode, stageIndex, stageEvents)
        saveStageMeta(this.state.worldCode, this.state.stageMetas)

        console.log(
          `[world-timeline] 阶段 ${stageIndex} 批次 ${batchIdx + 1}/${totalBatches} 完成: ` +
          `共 ${filledCount}/${stageEvents.length} 事件已填充`,
        )
      } catch (error) {
        console.warn(`[world-timeline] 阶段 ${stageIndex} 批次 ${batchIdx + 1}/${totalBatches} 失败:`, error)
      }
    }
  }

  needsAIFill(stageIndex?: number): boolean {
    const idx = stageIndex ?? this.state.currentStage
    const events = this.state.activeStages[idx]
    if (!events) return false
    return events.some((e) => !e.filled) && this.callAI !== null
  }

  // ========== 过去历史 ==========

  /** 是否已生成过去历史事件 */
  hasPastHistory(): boolean {
    return this.state.pastHistoryEvents.length > 0
  }

  /** 获取过去历史事件列表（按年份从古到今排序） */
  getPastHistory(): TimelineEvent[] {
    return [...this.state.pastHistoryEvents].sort((a, b) => a.year - b.year)
  }

  /**
   * 格式化为 Prompt 文本，供 AI 叙事引用
   * 例："50000年前，天道裂变... | 12000年前，大能创建仙盟..."
   */
  formatPastHistoryForPrompt(): string {
    if (!this.hasPastHistory()) return ''
    const events = this.getPastHistory()
    return events.map(e =>
      `【${Math.abs(e.year)}年前】${e.title}：${e.description}`
    ).join('\n')
  }

  /**
   * AI 生成过去历史事件（骨架 + pastHistoryPrompt 专用模板填充）
   */
  async generatePastHistory(count: number = 15): Promise<boolean> {
    const callFn = this.pastHistoryCallAI ?? this.callAI
    if (!callFn) return false
    if (this.hasPastHistory() && this.state.pastHistoryEvents.every((e) => e.filled)) return true

    const cal = useWorldStore.getState().calibration
    const strategy = getEventDistributionStrategy(cal)
    const { minYear, maxYear } = resolvePastHistoryYearRange({
      civilizationStage: this.civilizationStage,
      spatialForm: useWorldStore.getState().worldConfig?.spatialForm ?? 'plane',
      eventDistributionStrategy: strategy,
      anchorYear: this.anchorYear,
    })
    const worldviewStyleHint = this.pastHistoryStyleHint || buildTimelineStyleHint(
      this.civilizationStage,
      this.worldDescription,
      resolveWorldviewStyleHint({
        cal,
        essenceTag: this.essenceTag,
        worldDescription: this.worldDescription,
        worldType: this.worldType,
      }),
      cal,
      this.worldType,
      this.essenceTag,
    )

    const skeleton = this.state.pastHistoryEvents.length > 0
      ? this.state.pastHistoryEvents
      : generatePastHistorySkeleton(this.state.seed, count, minYear, maxYear)
    this.state.pastHistoryEvents = skeleton

    const unfilled = skeleton.filter((e) => !e.filled)
    if (unfilled.length === 0) return true

    const prompt = pastHistoryPrompt.userPromptTemplate
      .replace('{{worldName}}', this.worldName)
      .replace('{{essenceTag}}', this.essenceTag)
      .replace('{{civilizationStage}}', this.civilizationStage)
      .replace('{{worldDescription}}', this.worldDescription)
      .replace('{{coherenceHint}}', this.coherenceHint)
      .replace('{{coherenceNote}}', this.coherenceNote)
      .replace('{{worldType}}', this.worldType)
      .replace('{{worldviewStyleHint}}', worldviewStyleHint)
      .replace('{{count}}', String(count))
      .replace('{{eraAnchorYear}}', String(this.anchorYear))
      .replace('{{maxYearsAgo}}', String(Math.abs(minYear)))
      .replace('{{minYearsAgo}}', String(Math.abs(maxYear)))

    console.info(
      `[world-timeline] 开始填充上古史骨架 ${unfilled.length} 个事件（${minYear}~${maxYear}年）`,
    )

    const guardCtx = {
      worldDescription: this.worldDescription,
      worldType: this.worldType,
    }

    try {
      let response = ''
      let retryHint = ''

      for (let attempt = 0; attempt < 2; attempt++) {
        response = await callFn(
          prompt,
          retryHint ? [retryHint] : undefined,
        )
        if (!response || response.trim() === '' || response.trim() === '无') {
          console.warn('[world-timeline] 上古史填充: AI 返回空')
          return false
        }

        const violations = detectCoherenceViolations(response, guardCtx)
        if (violations.length > 0 && attempt === 0) {
          console.warn(`[world-timeline] 上古史含禁词 ${violations.join('、')}，重试`)
          retryHint = buildCoherenceRetryHint(violations)
          continue
        }
        break
      }

      const parsed = parseAIJSON<Array<{
        year?: number; title?: string; description?: string; impact?: string; type?: string
        chainEffects?: string[]; involvedFactions?: string[]
      }>>(response)
      if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
        console.warn('[world-timeline] 上古史: AI 响应无法解析为 JSON 数组')
        return false
      }

      let matchedCount = 0
      for (const aiEvent of parsed) {
        let target: TimelineEvent | undefined
        const rawYear = aiEvent.year
        let normalizedYear: number | undefined
        if (rawYear !== undefined) {
          let yearInput = rawYear
          // AI 偶发返回绝对纪年：转为相对纪元元年的负偏移
          if (yearInput > 0 && this.anchorYear > 500 && yearInput > this.anchorYear * 0.5) {
            yearInput = yearInput - this.anchorYear
          }
          normalizedYear = normalizePastHistoryYear(
            yearInput, matchedCount, parsed.length, minYear, maxYear,
          )
          target = unfilled.find((e) => e.year === normalizedYear)
        }
        if (!target) {
          target = unfilled[matchedCount]
        }
        if (!target) continue

        if (normalizedYear !== undefined) target.year = normalizedYear

        if (aiEvent.title) target.title = aiEvent.title
        if (aiEvent.description) target.description = aiEvent.description
        if (aiEvent.impact) target.impact = aiEvent.impact as ImpactLevel
        if (aiEvent.type) target.type = aiEvent.type as WorldTimelineEventType
        if (aiEvent.chainEffects) target.chainEffects = aiEvent.chainEffects
        if (aiEvent.involvedFactions) target.involvedFactions = aiEvent.involvedFactions
        target.filled = true
        matchedCount++
      }

      this.state.pastHistoryEvents = skeleton.sort((a, b) => a.year - b.year)
      savePastHistory(this.state.worldCode, this.state.pastHistoryEvents)

      const filledCount = this.state.pastHistoryEvents.filter((e) => e.filled).length
      console.info(`[world-timeline] 上古史填充完成: ${filledCount}/${skeleton.length} 个事件`)
      return filledCount > 0
    } catch (error) {
      console.warn('[world-timeline] 上古史填充失败:', error)
      return false
    }
  }

  // ========== 事件查询 ==========

  /** 通过段索引快速查找指定阶段中某段的事件 */
  getEventsBySegment(stageIndex: number, segmentIndex: number): TimelineEvent[] {
    const segEvents = this.segmentIndexes[stageIndex]?.[segmentIndex]
    return segEvents ? [...segEvents] : []
  }

  /** 查找指定年份附近半径内的事件，使用段索引加速 */
  getNearbyEvents(
    year: number,
    radius: number,
    filters?: {
      types?: TimelineEvent['type'][]
      impacts?: TimelineEvent['impact'][]
    },
  ): TimelineEvent[] {
    return this.getEventsInRange(year - radius, year + radius, filters)
  }

  getEventsInRange(
    startYear: number,
    endYear: number,
    filters?: {
      types?: TimelineEvent['type'][]
      impacts?: TimelineEvent['impact'][]
    },
  ): TimelineEvent[] {
    const events: TimelineEvent[] = []
    const seenIds = new Set<string>()

    const startStage = getStageIndex(startYear, this.anchorYear)
    const endStage = getStageIndex(endYear, this.anchorYear)
    const segmentSize = STAGE_SPAN / SEGMENTS_PER_STAGE

    for (let s = startStage; s <= endStage; s++) {
      const stageEvents = this.state.activeStages[s]
      if (!stageEvents) continue

      const segIdx = this.segmentIndexes[s]
      if (segIdx) {
        const stageStart = this.anchorYear + s * STAGE_SPAN
        const firstSeg = clamp(Math.floor((startYear - stageStart) / segmentSize), 0, Infinity)
        const lastSeg = Math.min(SEGMENTS_PER_STAGE - 1, Math.floor((endYear - stageStart) / segmentSize))

        for (let seg = firstSeg; seg <= lastSeg; seg++) {
          const segEvents = segIdx[seg]
          if (!segEvents) continue
          for (const evt of segEvents) {
            if (seenIds.has(evt.id)) continue
            if (evt.year >= startYear && evt.year <= endYear) {
              if (filters?.types && !filters.types.includes(evt.type)) continue
              if (filters?.impacts && !filters.impacts.includes(evt.impact)) continue
              events.push(evt)
              seenIds.add(evt.id)
            }
          }
        }
      } else {
        for (const evt of stageEvents) {
          if (seenIds.has(evt.id)) continue
          if (evt.year >= startYear && evt.year <= endYear) {
            if (filters?.types && !filters.types.includes(evt.type)) continue
            if (filters?.impacts && !filters.impacts.includes(evt.impact)) continue
            events.push(evt)
            seenIds.add(evt.id)
          }
        }
      }
    }

    return events.sort((a, b) => a.year - b.year)
  }

  // ========== ISubSystem 接口 ==========

  collectState(_context: RoundContext): SubSystemState {
    const currentEvents = this.state.activeStages[this.state.currentStage] ?? []
    const filledCount = currentEvents.filter((e) => e.filled).length
    const unfilledCount = currentEvents.filter((e) => !e.filled).length
    const pastCount = this.state.pastHistoryEvents.length

    return {
      id: this.id,
      summary: `时间线：第 ${this.state.currentStage} 阶段，${filledCount}/${currentEvents.length} 事件已填充${pastCount > 0 ? `，${pastCount} 条上古史` : ''}`,
      data: {
        ...structuredClone(this.state) as unknown as Record<string, unknown>,
        pendingAIFill: unfilledCount > 0 && this.callAI !== null,
        needsAIFill: unfilledCount > 0 && this.callAI !== null ? this.state.currentStage : -1,
        pastHistoryAvailable: pastCount > 0,
      },
    }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    void context;
    // 时间线是只读查询系统，不接受变更
  }

  reset(): void {
    if (typeof window === 'undefined') return
    const stageKeys = Object.keys(this.state.activeStages).map(Number)
    for (const s of stageKeys) {
      deleteStage(this.state.worldCode, s)
    }
    try { saveStore.remove('mod-world', 0, `timeline-meta:${this.state.worldCode}`) } catch (_error) { /* ignore */ }
    try { saveStore.remove('mod-world', 0, `past-history:${this.state.worldCode}`) } catch (_error) { /* ignore */ }

    this.state = { worldCode: 0, seed: 0, currentStage: 0, activeStages: {}, stageMetas: {}, maxGeneratedStage: 1, pastHistoryEvents: [] }
    this.segmentIndexes = {}
    this.essenceTag = ''
    this.worldName = ''
    this.worldDescription = ''
    this.callAI = null
  }
}
