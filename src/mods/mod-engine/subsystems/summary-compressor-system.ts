/**
 * @module summary-compressor-system.ts
 * @description 叙事总结压缩系统 —— 六级 AI 驱动压缩管线
 * @mod mod-engine
 *
 * 来源: summary-compressor-spec.md 完整规范
 *
 * 为什么需要压缩：
 *   每轮生成叙事文本后追加到历史，连续数百轮后 Prompt 将超出 AI token 限制。
 *   压缩器通过六级渐进压缩解决此问题：
 *   - L1 块总结：将连续 10 轮叙事压缩为一段摘要（落后 1 个完整块延迟执行）
 *   - L2 深度压缩：将 5 条 L1 摘要再压缩为一条（50轮）
 *   - L3 骨架压缩：将 5 条 L2 摘要压缩为时代骨架（250轮）
 *   - L4 纪元压缩：将 5 条 L3 骨架压缩为纪元概览（1250轮）
 *   - L5 时代压缩：将 5 条 L4 纪元压缩为时代概略（6250轮）
 *   - L6 历史压缩：将 5 条 L5 时代压缩为历史概略（31250轮）
 *
 * 这确保 AI 始终有覆盖延迟区间的最近 20 轮原始上下文，同时距离越远的历史被压缩得越紧凑。
 * L6 层级覆盖 31250 轮，日步进玩家可体验约 85 年人生。
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
  LongTermMemory,
  LifeStage,
  NarrativeDirection,
  AIModelConfig,
} from '@/foundation'
import { BaseSubsystem, callAI } from '@/core'
import { useSettingsStore } from '@/mods/mod-settings'

import {
  buildSummaryPrompt,
  buildSummarySystemPrompt,
} from '../prompts/summary-prompt'
import { requireCompletedSummaryContent } from '../helpers/summary-coverage'
import {
  SUMMARY_INTERVAL,
  COMPRESS_L1_DELAY_ROUNDS,
  RECENT_NARRATIVE_WINDOW,
  COMPRESS_L2_MERGE_COUNT,
  COMPRESS_L2_DELAY_ROUNDS,
  COMPRESS_L3_MERGE_COUNT,
  COMPRESS_L3_DELAY_ROUNDS,
  COMPRESS_L4_MERGE_COUNT,
  COMPRESS_L5_MERGE_COUNT,
  COMPRESS_L5_DELAY_ROUNDS,
  COMPRESS_L6_MERGE_COUNT,
  COMPRESS_L6_DELAY_ROUNDS,
} from '../constants'
import {
  computeSummaryTokenBudget,
  computeSummaryL2Tokens,
  computeSummaryL3Tokens,
  computeSummaryL4Tokens,
  computeSummaryL5Tokens,
  computeSummaryL6Tokens,
} from '../utils'

import type { MemoryLifecycleSystem } from './memory-lifecycle-system'
import { digestLedger } from '../helpers/digest-ledger'

// ============================================================
// 类型（内部使用）
// ============================================================

/** generateCompressedSummaries 返回值 */
export interface CompressionResult {
  /** 更新后的压缩摘要 */
  newCompressedSummaries: CompressedSummaries
  /** 本轮新生成的 L1 摘要文本（可能为空） */
  newLatestSummary: string
  /** 是否需要在 UI 显示本轮总结 */
  shouldShowSummary: boolean
  /** 本轮是否生成了通过完整覆盖校验的新压缩摘要 */
  didCompress: boolean,
}

// 兼容旧导出
export type CompressionLevel = 'L0' | 'L1' | 'L2' | 'L3'
export interface CompressedEntry {
  level: CompressionLevel
  content: string
  originalCount: number
  compressedAt: number,
}
export interface CompressorConfig {
  l1TriggerCount: number
  l2TriggerCount: number
  l3TriggerCount: number,
}
export interface CompressorStats {
  totalL1: number
  totalL2: number
  totalL3: number
  totalL4: number
  totalL5: number
  totalL6: number
  lastCompressionAt: number,
}

// ============================================================
// SummaryCompressorSystem
// ============================================================

export class SummaryCompressorSystem extends BaseSubsystem {
  readonly id = 'summary-compressor' as const
  readonly mod = 'mod-engine' as const
  readonly label = '叙事压缩' as const
  readonly description = '六级压缩管线管理叙事历史，防止 Prompt 超 token 限制' as const

  /** 当前压缩摘要状态 */
  private compressedSummaries: CompressedSummaries = { summaries: [] }

  /** 统计 */
  private stats: CompressorStats = {
    totalL1: 0,
    totalL2: 0,
    totalL3: 0,
    totalL4: 0,
    totalL5: 0,
    totalL6: 0,
    lastCompressionAt: 0,
  }

  // ---- 公共访问器 ----

  getSummaries(): CompressedSummaries {
    return { summaries: [...this.compressedSummaries.summaries] }
  }

  getStats(): CompressorStats {
    return { ...this.stats }
  }

  /** 从 EngineState 已有字段恢复压缩器私有状态，不扩展存档载荷。 */
  restoreFromEngineState(
    summaries: CompressedSummaries | undefined,
    stats?: { l1Count?: number; l2Count?: number; l3Count?: number; l4Count?: number; lastAt?: number },
  ): void {
    this.compressedSummaries = structuredClone(summaries ?? { summaries: [] })
    const countLevel = (level: number) => this.compressedSummaries.summaries.filter((item) => item.level === level).length
    this.stats = {
      totalL1: stats?.l1Count ?? countLevel(1),
      totalL2: stats?.l2Count ?? countLevel(2),
      totalL3: stats?.l3Count ?? countLevel(3),
      totalL4: stats?.l4Count ?? countLevel(4),
      totalL5: countLevel(5),
      totalL6: countLevel(6),
      lastCompressionAt: stats?.lastAt ?? 0,
    }
  }

  // ---- 旧 API 兼容（保留，供现有代码过渡） ----

  getAllCompressed(): CompressedEntry[] {
    return this.compressedSummaries.summaries.map((s) => ({
      level: `L${s.level}` as CompressionLevel,
      content: s.content,
      originalCount: 5, // 近似值
      compressedAt: this.stats.lastCompressionAt,
    }))
  }

  checkNeed(narratives: string[]): CompressionLevel | null {
    // 兼容旧接口，返回 null（新管线由 generateCompressedSummaries 管理）
    void narratives
    return null
  }

  compressLocal(level: CompressionLevel, entries: string[]): CompressedEntry {
    // 兼容旧接口，保留完整文本（不截断）
    const now = Date.now()
    const summary = entries
      .map((e, i) => {
        if (level === 'L1') return `${i + 1}. ${e}`
        return e
      })
      .join(' | ')

    return {
      level,
      content: summary,
      originalCount: entries.length,
      compressedAt: now,
    }
  }

  applyCompression(level: CompressionLevel, _entry: CompressedEntry): void {
    void level
    void _entry
    // 兼容旧接口，实际由 generateCompressedSummaries 管理
  }

  // ============================================================
  // 核心方法：四级 AI 驱动压缩管线
  // 来源: summary-compressor-spec.md §4
  // ============================================================

  /**
   * 生成压缩摘要（每轮叙事生成后调用）
   *
   * @param config AI 模型配置
   * @param events 全部叙事事件数组（从第 1 轮到当前轮）
   * @param world 世界设定
   * @param character 角色信息
   * @param turnCount 当前回合数（0-based）
   * @param resolvedBranches 已解决的分支选择
   * @param storySeed 存档级剧情种子
   */
  async generateCompressedSummaries(
    config: AIModelConfig,
    events: YearEvent[],
    world: WorldSetting,
    character: CharacterState,
    turnCount: number,
    resolvedBranches?: Record<number, string>,
    storySeed?: string,
    _memoryLifecycle?: MemoryLifecycleSystem,
  ): Promise<CompressionResult> {
    // 读取用户 AI 设置
    const { customKey, provider, customUrl, customModel } = useSettingsStore.getState()
    const model = customModel || config.model
    const routeOpts = { providerId: provider, customBaseUrl: customUrl || undefined, customModel: model } as const
    const aiConfig = { ...config, model }
    const summarySessionId = storySeed ?? world.name.replace(/\s+/g, '-').slice(0, 32)

    // Step 0: 入口检查
    if (turnCount + 1 <= 0) {
      return {
        newCompressedSummaries: this.compressedSummaries,
        newLatestSummary: '',
        shouldShowSummary: false,
        didCompress: false,
      }
    }

    // Step 1: 计算块索引
    const blockIndex = Math.floor((turnCount + 1) / SUMMARY_INTERVAL)
    const blockRound = (turnCount + 1) % SUMMARY_INTERVAL
    const isBlockBoundary = blockRound === 0

    let summaries = [...this.compressedSummaries.summaries]
    let newLatestSummary = ''
    let shouldShowSummary = false
    let didCompress = false
    const appendSummary = (summary: CompressedSummaryItem): void => {
      summaries = [...summaries, summary]
      didCompress = true
    }
    const scopeFromEvents = (items: YearEvent[]): Pick<CompressedSummaryItem, 'contextIds' | 'startTotalDays' | 'endTotalDays'> => {
      const contextIds = [...new Set(items.map((item) => item.contextId).filter((id): id is string => Boolean(id)))]
      const totalDays = items.map((item) => item.totalDays).filter((value): value is number => typeof value === 'number')
      return {
        ...(contextIds.length > 0 ? { contextIds } : {}),
        ...(totalDays.length > 0 ? {
          startTotalDays: Math.min(...totalDays),
          endTotalDays: Math.max(...totalDays),
        } : {}),
      }
    }
    const scopeFromSummaries = (items: CompressedSummaryItem[]): Pick<CompressedSummaryItem, 'contextIds' | 'startTotalDays' | 'endTotalDays'> => {
      const contextIds = [...new Set(items.flatMap((item) => item.contextIds ?? []))]
      const startDays = items.map((item) => item.startTotalDays).filter((value): value is number => typeof value === 'number')
      const endDays = items.map((item) => item.endTotalDays).filter((value): value is number => typeof value === 'number')
      return {
        ...(contextIds.length > 0 ? { contextIds } : {}),
        ...(startDays.length > 0 ? { startTotalDays: Math.min(...startDays) } : {}),
        ...(endDays.length > 0 ? { endTotalDays: Math.max(...endDays) } : {}),
      }
    }

    // ============================================================
    // Step 2: L1 块总结
    // ============================================================
    // Phase 7A-4：L1 延迟一个完整块触发（第 21 轮开始生成第 1—10 轮）
    if (!isBlockBoundary && blockRound === COMPRESS_L1_DELAY_ROUNDS && blockIndex >= 2) {
      const targetBlock = blockIndex - 2
      const startRound = targetBlock * SUMMARY_INTERVAL + 1
      const endRound = (targetBlock + 1) * SUMMARY_INTERVAL

      // 去重检查
      const existing = summaries.find(
        (s) => s.level === 1 && s.startRound === startRound,
      )
      if (!existing) {
        // `events` 是保留窗口，不一定从第 1 轮开始；必须按真实 round/id
        // 取目标块，不能把 round 当作当前数组的零基下标。
        const blockEvents = events.filter(
          (event) => event.id >= startRound && event.id <= endRound,
        )
        try {
          const totalNarrativeChars = blockEvents.reduce(
            (sum, e) => sum + (e.narrative?.length || 0),
            0,
          )
          let summaryTokens = computeSummaryTokenBudget(totalNarrativeChars)

          // 只使用 AI 摘要账本的重要性；缺失时采用中性 0.5，不扫描叙事正文。
          const ledgerAvg = digestLedger.averageAdjustedImportance(startRound, endRound) ?? 0.5
          const boostFactor = 0.75 + ledgerAvg
          summaryTokens = Math.round(summaryTokens * boostFactor)

          const { system, user } = buildSummaryPrompt(
            blockEvents,
            world,
            character,
            [],
            resolvedBranches,
          )

          const raw = await callAI(system, user, {
            config: aiConfig,
            pool: 'summary',
            sessionId: summarySessionId,
            storySeed,
            apiKey: customKey || undefined,
            ...routeOpts,
            overrideMaxTokens: summaryTokens,
            overrideTemperature: 0.6,
            overrideTopP: 0.8,
            logContext: { callKind: 'summary-compress-L1', round: endRound, sessionId: summarySessionId },
            logMeta: { userId: `summ-${summarySessionId}` },
          })

          const trimmed = this.sanitizeContent(raw)
          appendSummary({
            level: 1 as const,
            startRound,
            endRound,
            content: trimmed,
            ...scopeFromEvents(blockEvents),
          })
          newLatestSummary = trimmed
          shouldShowSummary = true
          this.stats.totalL1++
        } catch {
          // 保留目标区间的完整原始事件等待后续重试；失败不得建立覆盖节点或成功统计。
        }
      }
    }

    // ============================================================
    // Step 3: L2 深度压缩
    // ============================================================
    if (blockRound >= COMPRESS_L2_DELAY_ROUNDS) {
      const l1Summaries = summaries.filter((s) => s.level === 1)
      const l2Summaries = summaries.filter((s) => s.level >= 2)

      // 找出未被任何 L2+ 覆盖的 L1 摘要
      const unmergedL1 = l1Summaries.filter(
        (l1) =>
          !l2Summaries.some(
            (l2) => l1.startRound >= l2.startRound && l1.endRound <= l2.endRound,
          ),
      )

      if (unmergedL1.length >= COMPRESS_L2_MERGE_COUNT) {
        const mergeTargets = unmergedL1.slice(0, COMPRESS_L2_MERGE_COUNT)
        const startRound = mergeTargets[0].startRound
        const endRound = mergeTargets[mergeTargets.length - 1].endRound

        // 去重检查
        const existing = summaries.find(
          (s) => s.level === 2 && s.startRound === startRound,
        )
        if (!existing) {
          const eventsForMerge = mergeTargets
            .map((s) => `[${s.startRound}-${s.endRound}] ${s.content}`)
            .join('\n')

          try {
            const maxTokens = computeSummaryL2Tokens(eventsForMerge.length)
            const system = buildSummarySystemPrompt(2)

            const raw = await callAI(system, eventsForMerge, {
              config: aiConfig,
              pool: 'summary',
              sessionId: summarySessionId,
              storySeed,
              apiKey: customKey || undefined,
              ...routeOpts,
              overrideMaxTokens: maxTokens,
              overrideTemperature: 0.4,
              overrideTopP: 0.7,
              logContext: { callKind: 'summary-compress-L2', sessionId: summarySessionId },
              logMeta: { userId: `summ-${summarySessionId}` },
            })

            appendSummary({
              level: 2 as const,
              startRound,
              endRound,
              content: this.sanitizeContent(raw),
              ...scopeFromSummaries(mergeTargets),
            })
            this.stats.totalL2++
          } catch {
            // 保留全部 L1 叶子等待后续重试；失败不得伪造覆盖节点。
          }
        }
      }
    }

    // ============================================================
    // Step 4: L3 骨架压缩
    // ============================================================
    if (blockRound >= COMPRESS_L3_DELAY_ROUNDS) {
      // 找出未被 L3+ 覆盖的 L2 摘要（注意: s.level >= 3）
      const unmergedL2 = summaries
        .filter((s) => s.level === 2)
        .filter(
          (l2) =>
            !summaries.some(
              (s) =>
                s.level >= 3 &&
                l2.startRound >= s.startRound &&
                l2.endRound <= s.endRound,
            ),
        )

      if (unmergedL2.length >= COMPRESS_L3_MERGE_COUNT) {
        const mergeTargets = unmergedL2.slice(0, COMPRESS_L3_MERGE_COUNT)
        const startRound = mergeTargets[0].startRound
        const endRound = mergeTargets[mergeTargets.length - 1].endRound

        const existing = summaries.find(
          (s) => s.level === 3 && s.startRound === startRound,
        )
        if (!existing) {
          const eventsForMerge = mergeTargets
            .map((s) => `[${s.startRound}-${s.endRound}] ${s.content}`)
            .join('\n')

          try {
            const maxTokens = computeSummaryL3Tokens(eventsForMerge.length)
            const system = buildSummarySystemPrompt(3)

            const raw = await callAI(system, eventsForMerge, {
              config: aiConfig,
              pool: 'summary',
              sessionId: summarySessionId,
              storySeed,
              apiKey: customKey || undefined,
              ...routeOpts,
              overrideMaxTokens: maxTokens,
              overrideTemperature: 0.3,
              overrideTopP: 0.6,
              logContext: { callKind: 'summary-compress-L3', sessionId: summarySessionId },
              logMeta: { userId: `summ-${summarySessionId}` },
            })

            appendSummary({
              level: 3 as const,
              startRound,
              endRound,
              content: this.sanitizeContent(raw),
              ...scopeFromSummaries(mergeTargets),
            })
            this.stats.totalL3++
          } catch {
            // 保留全部 L2 叶子等待后续重试；失败不得伪造覆盖节点。
          }
        }
      }
    }

    // ============================================================
    // Step 5: L4 纪元压缩（复用 L3 的 MERGE_COUNT 和 DELAY_ROUNDS）
    // ============================================================
    if (blockRound >= COMPRESS_L3_DELAY_ROUNDS) {
      const unmergedL3 = summaries
        .filter((s) => s.level === 3)
        .filter(
          (l3) =>
            !summaries.some(
              (s) =>
                s.level >= 4 &&
                l3.startRound >= s.startRound &&
                l3.endRound <= s.endRound,
            ),
        )

      if (unmergedL3.length >= COMPRESS_L4_MERGE_COUNT) {
        const mergeTargets = unmergedL3.slice(0, COMPRESS_L4_MERGE_COUNT)
        const startRound = mergeTargets[0].startRound
        const endRound = mergeTargets[mergeTargets.length - 1].endRound

        const existing = summaries.find(
          (s) => s.level === 4 && s.startRound === startRound,
        )
        if (!existing) {
          const eventsForMerge = mergeTargets
            .map((s) => `[${s.startRound}-${s.endRound}] ${s.content}`)
            .join('\n')

          try {
            const maxTokens = computeSummaryL4Tokens(eventsForMerge.length)
            const system = buildSummarySystemPrompt(4)

            const raw = await callAI(system, eventsForMerge, {
              config: aiConfig,
              pool: 'summary',
              sessionId: summarySessionId,
              storySeed,
              apiKey: customKey || undefined,
              ...routeOpts,
              overrideMaxTokens: maxTokens,
              overrideTemperature: 0.2,
              overrideTopP: 0.5,
              logContext: { callKind: 'summary-compress-L4', sessionId: summarySessionId },
              logMeta: { userId: `summ-${summarySessionId}` },
            })

            appendSummary({
              level: 4 as const,
              startRound,
              endRound,
              content: this.sanitizeContent(raw),
              ...scopeFromSummaries(mergeTargets),
            })
            this.stats.totalL4++
          } catch {
            // 保留全部 L3 叶子等待后续重试；失败不得伪造覆盖节点。
          }
        }
      }
    }

    // ============================================================
    // Step 6: L5 时代压缩
    // ============================================================
    if (blockRound >= COMPRESS_L5_DELAY_ROUNDS) {
      const unmergedL4 = summaries
        .filter((s) => s.level === 4)
        .filter(
          (l4) =>
            !summaries.some(
              (s) =>
                (s.level as number) >= 5 &&
                l4.startRound >= s.startRound &&
                l4.endRound <= s.endRound,
            ),
        )

      if (unmergedL4.length >= COMPRESS_L5_MERGE_COUNT) {
        const mergeTargets = unmergedL4.slice(0, COMPRESS_L5_MERGE_COUNT)
        const startRound = mergeTargets[0].startRound
        const endRound = mergeTargets[mergeTargets.length - 1].endRound

        const existing = summaries.find(
          (s) => (s.level as number) === 5 && s.startRound === startRound,
        )
        if (!existing) {
          const eventsForMerge = mergeTargets
            .map((s) => `[${s.startRound}-${s.endRound}] ${s.content}`)
            .join('\n')

          try {
            const maxTokens = computeSummaryL5Tokens(eventsForMerge.length)
            const system = buildSummarySystemPrompt(5)

            const raw = await callAI(system, eventsForMerge, {
              config: aiConfig,
              pool: 'summary',
              sessionId: summarySessionId,
              storySeed,
              apiKey: customKey || undefined,
              ...routeOpts,
              overrideMaxTokens: maxTokens,
              overrideTemperature: 0.15,
              overrideTopP: 0.4,
              logContext: { callKind: 'summary-compress-L5', sessionId: summarySessionId },
              logMeta: { userId: `summ-${summarySessionId}` },
            })

            appendSummary({
              level: 5,
              startRound,
              endRound,
              content: this.sanitizeContent(raw),
              ...scopeFromSummaries(mergeTargets),
            })
            this.stats.totalL5++
          } catch {
            // 保留全部 L4 叶子等待后续重试；失败不得伪造覆盖节点。
          }
        }
      }
    }

    // ============================================================
    // Step 7: L6 历史压缩（最高层级，31250轮）
    // ============================================================
    if (blockRound >= COMPRESS_L6_DELAY_ROUNDS) {
      const unmergedL5 = summaries
        .filter((s) => (s.level as number) === 5)
        .filter(
          (l5) =>
            !summaries.some(
              (s) =>
                (s.level as number) >= 6 &&
                l5.startRound >= s.startRound &&
                l5.endRound <= s.endRound,
            ),
        )

      if (unmergedL5.length >= COMPRESS_L6_MERGE_COUNT) {
        const mergeTargets = unmergedL5.slice(0, COMPRESS_L6_MERGE_COUNT)
        const startRound = mergeTargets[0].startRound
        const endRound = mergeTargets[mergeTargets.length - 1].endRound

        const existing = summaries.find(
          (s) => (s.level as number) === 6 && s.startRound === startRound,
        )
        if (!existing) {
          const eventsForMerge = mergeTargets
            .map((s) => `[${s.startRound}-${s.endRound}] ${s.content}`)
            .join('\n')

          try {
            const maxTokens = computeSummaryL6Tokens(eventsForMerge.length)
            const system = buildSummarySystemPrompt(6)

            const raw = await callAI(system, eventsForMerge, {
              config: aiConfig,
              pool: 'summary',
              sessionId: summarySessionId,
              storySeed,
              apiKey: customKey || undefined,
              ...routeOpts,
              overrideMaxTokens: maxTokens,
              overrideTemperature: 0.1,
              overrideTopP: 0.3,
              logContext: { callKind: 'summary-compress-L6', sessionId: summarySessionId },
              logMeta: { userId: `summ-${summarySessionId}` },
            })

            appendSummary({
              level: 6,
              startRound,
              endRound,
              content: this.sanitizeContent(raw),
              ...scopeFromSummaries(mergeTargets),
            })
            this.stats.totalL6++
          } catch {
            // 保留全部 L5 叶子等待后续重试；失败不得伪造覆盖节点。
          }
        }
      }
    }

    // Step 8: 更新内部状态并返回。所有层级摘要完整保留；容量压力只能通过
    // 更高层语义压缩与叶子摘要注入处理，禁止按条目数淘汰历史事实。
    this.compressedSummaries = { summaries }
    if (didCompress) {
      this.stats.lastCompressionAt = Date.now()
    }

    return {
      newCompressedSummaries: { summaries },
      newLatestSummary,
      shouldShowSummary,
      didCompress,
    }
  }

  // ============================================================
  // determineLocalDirection: 7 步优先级方向预判
  // 来源: summary-compressor-spec.md §5
  // ============================================================

  /**
   * 方向预判
   *
   * 按优先级从高到低执行，找到第一个匹配的方向即返回。
   */
  determineLocalDirection(
    _events: YearEvent[],
    memory: LongTermMemory,
    dynamicAttrs: Record<string, number>,
    forceBranch: boolean,
    lifeStage: LifeStage,
    lastPlayerChoice?: string,
    _worldview?: string,
  ): NarrativeDirection {
    let direction: NarrativeDirection = null

    // Step 1: 玩家选择优先 (⭐⭐⭐⭐⭐⭐⭐)
    if (lastPlayerChoice) {
      const choice = lastPlayerChoice
      if (/战斗|攻击|征服|入侵/.test(choice)) direction = '战斗/征服'
      else if (/经商|买卖|交易|积累|赚钱/.test(choice)) direction = '经商/积累'
      else if (/修炼|练功|突破|境界/.test(choice)) direction = '修炼/突破'
      else if (/结盟|结交|社交|和谈/.test(choice)) direction = '社交/结盟'
      else if (/探索|冒险|秘境|发现/.test(choice)) direction = '探索/冒险'
      else if (/建设|经营|发展|管理/.test(choice)) direction = '经营/建设'
      else if (/学习|研究|知识/.test(choice)) direction = '学习/研究'
    }

    // Step 2: worldview-方向兼容性检测
    // 设计理念：AI 通过 worldDescription/worldRules 已充分了解世界观约束；
    // 本步骤仅作"提示"（玩家意图与世界观可能不兼容），不硬删除方向。
    // 删除方向 = 让 AI 完全丧失玩家意图信息，比保留方向更糟。
    // 玩家意图方向保留后，AI 可基于世界规则自行判断如何叙事。
    // （例：唯物世界玩家输入"修炼"——AI 可写"主角尝试用科学方式强身健体"，给出自洽解释）

    // Step 3: 派系目标检测 (⭐⭐⭐⭐⭐)
    if (direction === null && memory.faction && memory.faction.rank >= 5) {
      direction = '经营/建设'
    }

    // Step 4: 动态属性趋势 (⭐⭐⭐⭐)
    if (direction === null) {
      if ((dynamicAttrs.wealth ?? 0) < -5) direction = '经商/积累'
      else if ((dynamicAttrs.fame ?? 0) < -3) direction = '社交/结盟'
    }

    // Step 5: 强制分支冲突方向 (⭐⭐⭐)
    if (direction === null && forceBranch) {
      const conflictPools: NarrativeDirection[] = ['战斗/征服', '探索/冒险', '社交/结盟']
      direction = conflictPools[Math.floor(Math.random() * conflictPools.length)]
    }

    // Step 6: 按生命阶段默认方向 (⭐⭐)
    if (direction === null) {
      const stagePools: Record<string, NarrativeDirection[]> = {
        infant: ['日常/生活'],
        child: ['学习/研究', '日常/生活'],
        teenager: ['学习/研究', '社交/结盟', '探索/冒险'],
        young_adult: ['战斗/征服', '经商/积累', '社交/结盟', '探索/冒险', '经营/建设'],
        adult: ['经营/建设', '经商/积累', '社交/结盟', '战斗/征服'],
        middle_age: ['经营/建设', '社交/结盟', '学习/研究', '日常/生活'],
        elder: ['日常/生活', '学习/研究', '社交/结盟'],
      }
      const pool = stagePools[lifeStage]
      if (pool) {
        direction = pool[Math.floor(Math.random() * pool.length)]
      }
    }

    // Step 7: 兜底 (⭐)
    if (direction === null) {
      direction = '日常/生活'
    }

    return direction
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 构建用于 Prompt 的压缩后历史文本（叶子摘要注入策略）
   *
   * 策略：只注入不被更高层级覆盖的"叶子"摘要，避免冗余传输。
   * 例如 L2 已覆盖第 1-25 轮，则第 1-5、6-10、...、21-25 轮的 L1 不再重复注入。
   *
   * 实际生产路径为 memoryLifecycle.buildRichPrompt + formatRichPromptForInjection，
   * 此方法作为备选/测试接口保留。
   *
   * @param recentNarratives 最近原始叙事文本数组
   * @param currentAge 可选的角色当前年龄，提供后在输出的各层级中添加年龄标注
   */
  buildPromptHistory(recentNarratives: string[], currentAge?: number): string {
    const parts: string[] = []
    const summaries = this.compressedSummaries.summaries

    // 角色年龄时间锚点
    if (currentAge !== undefined) {
      parts.push(`【角色当前年龄】${currentAge}岁`)
    }

    if (summaries.length === 0) {
      if (recentNarratives.length > 0) {
        parts.push('【最新发展】\n' + recentNarratives.slice(-RECENT_NARRATIVE_WINDOW).join('\n---\n'))
      }
      return parts.join('\n\n')
    }

    // 按层级从高到低分组
    const byLevel = new Map<number, typeof summaries>()
    for (const s of summaries) {
      const lv = s.level as number
      if (!byLevel.has(lv)) byLevel.set(lv, [])
      byLevel.get(lv)!.push(s)
    }
    const levels = [...byLevel.keys()].sort((a, b) => b - a) // L6 → L1

    // 叶子注入：高层摘要"覆盖"低层摘要的区间，被覆盖的 L1 不再重复传输
    const coveredRanges: Array<{ start: number; end: number }> = []
    const levelLabels: Record<number, string> = {
      6: '历史概略', 5: '时代概略', 4: '纪元概览', 3: '时代概略', 2: '历史概要', 1: '近期摘要',
    }

    for (const level of levels) {
      const items = byLevel.get(level)!
      const visible = items.filter((s) =>
        !coveredRanges.some((r) => s.startRound >= r.start && s.endRound <= r.end),
      )
      if (visible.length === 0) continue

      // 标记载入区域
      for (const v of visible) {
        coveredRanges.push({ start: v.startRound, end: v.endRound })
      }

      const label = levelLabels[level] ?? `L${level}`
      const ageSuffix = currentAge !== undefined ? `·${currentAge}岁视角` : ''
      parts.push(
        `【${label}${ageSuffix}】\n${visible.map((s) => s.content).join('\n')}`,
      )
    }

    if (recentNarratives.length > 0) {
      parts.push('【最新发展】\n' + recentNarratives.slice(-RECENT_NARRATIVE_WINDOW).join('\n---\n'))
    }

    return parts.join('\n\n')
  }

  /** 清理 AI 返回内容 */
  private sanitizeContent(raw: string): string {
    return requireCompletedSummaryContent(raw)
  }

  // ============================================================
  // ISubSystem 实现
  // ============================================================

  collectState(_context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: `【${this.label}】L1:${this.stats.totalL1} L2:${this.stats.totalL2} L3:${this.stats.totalL3} L4:${this.stats.totalL4} L5:${this.stats.totalL5} L6:${this.stats.totalL6}`,
      data: structuredClone({
        stats: this.stats,
        summaries: this.compressedSummaries,
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes: expected object`)
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch`)
    }
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`)
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`)
    }
    // 压缩系统一般不从外部接收变更
    void changes.changes;
  }

  reset(): void {
    this.compressedSummaries = { summaries: [] }
    this.stats = {
      totalL1: 0,
      totalL2: 0,
      totalL3: 0,
      totalL4: 0,
      totalL5: 0,
      totalL6: 0,
      lastCompressionAt: 0,
    }
  }
}

/** 单例 */
export const summaryCompressor = new SummaryCompressorSystem()
