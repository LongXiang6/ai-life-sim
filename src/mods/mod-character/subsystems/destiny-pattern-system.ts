/**
 * @module destiny-pattern-system.ts
 * @description 命格子系统
 * @mod mod-character
 */

import type { ISubSystem, RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'
import type { DestinyPattern, DestinyPatternInput, DestinyPatternRarity, DestinyPatternPolarity, DestinyPatternState } from '../types'
import { clamp } from '@/core/shared'

import {
  PRESET_DESTINY_PATTERNS,
  DESTINY_PATTERN_RARITY_WEIGHTS,
  DESTINY_PATTERN_RARITY_LIMITS,
  DEFAULT_DESTINY_PATTERN_COUNT,
  DESTINY_PATTERN_SELECT_COUNT,
  DESTINY_PATTERN_ID_PREFIX,
  AI_DESTINY_PATTERN_BATCH_SIZE,
  AI_DESTINY_PATTERN_BATCH_COUNT,
} from '../constants'
import { destinyPatternPrompt } from '../prompts/destiny-pattern-prompt'
import { bumpTokenBudget } from '@/foundation'

import {
  buildDestinyPatternUserPromptKv,
  estimateDestinyPatternTokenBudget,
  DESTINY_PATTERN_DESC_MIN,
  DESTINY_PATTERN_EFFECT_MIN,
  type BuildDestinyPatternContextInput,
} from '../prompts/destiny-pattern-context'
import { buildFateKvSessionId } from '../utils/fate-kv'
import { useWorldStore } from '@/mods/mod-world'
import { useSettingsStore } from '@/mods/mod-settings'
import { validatePatternSystemModifiers } from '../utils/destiny-pattern-modifiers'
import { rejectsFutureDestinyPatternContent, rejectsBirthStateDestinyPatternContent } from '../utils/destiny-pattern-content-quality'
import { saveDestinyPatternPool } from '../utils/destiny-pattern-pool-cache'
import { StreamingJsonArrayParser } from '../utils/streaming-json-array-parser'

const POOL_FILL_BATCH_RETRIES = 3
const POOL_FILL_RETRY_DELAY_MS = 2000

type DestinyPatternAIItem = {
  name: string
  description: string
  rarity: string
  polarity: string
  effect: string
  attrBonus: Record<string, number>
  systemModifiers?: Record<string, number>
}

export type DestinyPatternPoolFillStatus = {
  inProgress: boolean
  count: number
  target: number
  completedBatches: number
  totalBatches: number
}

export class DestinyPatternSystem implements ISubSystem {
  readonly id = 'destiny-pattern' as const
  readonly mod = 'mod-character' as const
  readonly label = '命格' as const
  readonly description = '管理角色命格池，支持抽12选3 + AI 流式生成 + 内置预设双模式' as const

  private idCounter = 0
  private callAI: ((systemPrompt: string, userPrompt: string, options?: unknown) => Promise<string>) | null = null
  private poolFillPromise: Promise<void> | null = null
  private poolFillAbortController: AbortController | null = null
  private poolFillStatus: DestinyPatternPoolFillStatus = {
    inProgress: false,
    count: 0,
    target: AI_DESTINY_PATTERN_BATCH_SIZE * AI_DESTINY_PATTERN_BATCH_COUNT,
    completedBatches: 0,
    totalBatches: AI_DESTINY_PATTERN_BATCH_COUNT,
  }

  private state: DestinyPatternState = {
    candidates: [],
    patterns: [],
    rarityCount: { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0 },
  }

  collectState(_context: RoundContext): SubSystemState {
    const s = this.state
    const rarityLines = Object.entries(s.rarityCount)
      .filter(([, count]) => count > 0)
      .map(([r, c]) => `${this.getRarityLabel(r as DestinyPatternRarity)}×${c}`)
    const bonusSummary = this.summarizeAttrBonuses()

    return {
      id: this.id,
      summary: `【${this.label}】已持有 ${s.patterns.length} 条命格（${rarityLines.join(' ')}）${bonusSummary ? ' | 属性加成：' + bonusSummary : ''}`,
      data: structuredClone({
        candidates: s.candidates,
        patterns: s.patterns,
        rarityCount: s.rarityCount,
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return
    if (!changes.description || changes.description.trim() === '') return

    const ch = changes.changes
    // 添加命格
    if (Array.isArray(ch.addPatterns)) {
      for (const p of ch.addPatterns as DestinyPattern[]) {
        this.addPattern(p)
      }
    }
    // 设置完整命格列表
    if (Array.isArray(ch.patterns)) {
      this.state.patterns = []
      this.state.rarityCount = { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0 }
      for (const p of ch.patterns as DestinyPattern[]) {
        this.addPattern(p)
      }
    }
  }

  reset(): void {
    this.abortPoolFill()
    this.idCounter = 0
    this.state = {
      candidates: [],
      patterns: [],
      rarityCount: { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0 },
    }
  }

  // -------- 公共方法 --------

  /** 内置模式：从预设池随机生成候选命格（抽12，暂存 candidates，不直接写入 patterns） */
  generateFromPresets(count = DEFAULT_DESTINY_PATTERN_COUNT): DestinyPattern[] {
    const pool = [...PRESET_DESTINY_PATTERNS]
    const result: DestinyPattern[] = []

    // 加权随机抽取
    while (result.length < count && pool.length > 0) {
      const weighted = this.buildWeightedPool(pool, result)
      const idx = this.weightedRandomIndex(weighted)
      const template = weighted[idx]
      if (!template) continue

      const pattern: DestinyPattern = {
        id: `${DESTINY_PATTERN_ID_PREFIX.PRESET}-${this.idCounter++}`,
        ...template,
      }

      // 检查稀有度上限
      const limit = DESTINY_PATTERN_RARITY_LIMITS[pattern.rarity]
      const currentCount = result.filter((p) => p.rarity === pattern.rarity).length
      if (limit !== undefined && currentCount >= limit) {
        continue
      }

      result.push(pattern)
    }

    this.state.candidates = result
    return result
  }

  /**
   * 外部 AI 命格注入：校验传入的 AI 命格数据并追加到候选池
   *
   * 为 AI 生成的命格添加 'ai_' 前缀 ID 以区分预设命格。
   * 校验失败的条目会被静默跳过。
   */
  generateFromAI(aiGeneratedPatterns: DestinyPatternInput[]): DestinyPattern[] {
    const result: DestinyPattern[] = []

    for (const input of aiGeneratedPatterns) {
      const rarity = this.validateRarity(input.rarity)
      const polarity = this.validatePolarity(input.polarity)
      if (!rarity || !polarity) continue

      const pattern: DestinyPattern = {
        id: `ai_${this.idCounter++}`,
        name: input.name,
        description: input.description,
        rarity,
        polarity,
        effect: input.effects,
        attrBonus: input.attrBonus
          ? this.validateAttrBonus(input.attrBonus as Record<string, number>, rarity)
          : {},
      }

      result.push(pattern)
    }

    this.state.candidates.push(...result)
    return result
  }

  /** 后台命格池填充进度（与页面生命周期解耦） */
  getPoolFillStatus(): DestinyPatternPoolFillStatus {
    return { ...this.poolFillStatus }
  }

  /** 中止正在运行的后台池填充（页面离开或重新抽取时调用） */
  abortPoolFill(): void {
    this.poolFillAbortController?.abort()
    this.poolFillAbortController = null
    this.poolFillPromise = null
    this.poolFillStatus = { ...this.poolFillStatus, inProgress: false }
  }

  /** 设置 AI 服务实例（由引擎初始化时注入） */
  setAIService(callAIFn: (systemPrompt: string, userPrompt: string, options?: unknown) => Promise<string>): void {
    this.callAI = callAIFn
  }

  /**
   * AI 生成命格池（5 批 × 20 条 = 100 条）
   *
   * 每批将已有命格名称拼入 existingNames 避免重复。
   * 如果 AI 调用失败，降级使用 generateFromPresets() 从预设池生成。
   */
  async generateWithAI(
    contextInput: BuildDestinyPatternContextInput,
    onProgress?: (count: number, patterns: DestinyPattern[]) => void,
    onEarlyReady?: (patterns: DestinyPattern[]) => void,
    onBatchStart?: (batchIndex: number) => void,
  ): Promise<DestinyPattern[]> {
    if (!this.callAI) {
      throw new Error('[destiny-pattern] AI 服务未就绪，请重试')
    }

    // 中止旧的后台填充，防止并发状态污染
    this.abortPoolFill()

    const allPatterns: DestinyPattern[] = []
    const existingNames: string[] = []
    let earlyReadyFired = false
    let resolveEarlyReady: (() => void) | null = null
    const earlyReadyPromise = new Promise<void>((resolve) => {
      resolveEarlyReady = resolve
    })
    const startingAge = contextInput.character.startingAge ?? 0

    this.poolFillAbortController = new AbortController()
    this.poolFillStatus = {
      inProgress: true,
      count: 0,
      target: AI_DESTINY_PATTERN_BATCH_SIZE * AI_DESTINY_PATTERN_BATCH_COUNT,
      completedBatches: 0,
      totalBatches: AI_DESTINY_PATTERN_BATCH_COUNT,
    }

    const syncPoolStatus = () => {
      this.poolFillStatus.count = allPatterns.length
    }

    const persistPoolToLocal = () => {
      saveDestinyPatternPool(useWorldStore.getState().worldCode, [...allPatterns])
    }

    const ingestItem = (item: DestinyPatternAIItem) => {
      if (!item?.name || existingNames.includes(item.name)) return
      if (allPatterns.length >= AI_DESTINY_PATTERN_BATCH_SIZE * AI_DESTINY_PATTERN_BATCH_COUNT) return
      if (!this.passesContentQuality(item, startingAge)) return

      const rarity = this.validateRarity(item.rarity) ?? 'common'
      const pattern: DestinyPattern = {
        id: `${DESTINY_PATTERN_ID_PREFIX.AI}-${Date.now()}-${allPatterns.length}`,
        name: item.name,
        description: item.description,
        rarity,
        polarity: this.validatePolarity(item.polarity) ?? 'positive',
        effect: item.effect,
        attrBonus: this.validateAttrBonus(item.attrBonus, item.rarity),
        systemModifiers: validatePatternSystemModifiers(
          item.systemModifiers != null && typeof item.systemModifiers === 'object'
            ? (item.systemModifiers as Record<string, unknown>)
            : undefined,
          rarity,
        ),
      }

      allPatterns.push(pattern)
      existingNames.push(item.name)
      this.state.candidates = [...allPatterns]
      syncPoolStatus()
      onProgress?.(allPatterns.length, [...allPatterns])
      persistPoolToLocal()

      if (!earlyReadyFired && allPatterns.length >= DEFAULT_DESTINY_PATTERN_COUNT) {
        earlyReadyFired = true
        onEarlyReady?.([...allPatterns])
        resolveEarlyReady?.()
      }
    }

    const runBatch = async (batch: number, seed?: number, forceStream?: boolean): Promise<void> => {
      onBatchStart?.(batch)
      const t0 = performance.now()
      const kvPrepared = buildDestinyPatternUserPromptKv({
        ...contextInput,
        existingNames,
        includePresetNames: batch === 0,
      })
      const userPrompt = kvPrepared.userPrompt
      const fateSessionId = buildFateKvSessionId(useWorldStore.getState().worldCode)

      const useStream = forceStream === true || useSettingsStore.getState().streamingMode === 'stream'
      const streamParser = useStream ? new StreamingJsonArrayParser<DestinyPatternAIItem>() : null
      const countBefore = allPatterns.length

      const ingestResponse = (response: string): { parsedCount: number; addedCount: number } => {
        let added = 0
        let parsedCount = 0
        const parsed = this.parseAIResponse(response)
        parsedCount += parsed.length
        for (const item of parsed) {
          const before = allPatterns.length
          ingestItem(item)
          if (allPatterns.length > before) added++
        }
        if (useStream && streamParser) {
          const finalized = streamParser.finalize(response)
          parsedCount += finalized.length
          for (const item of finalized) {
            const before = allPatterns.length
            ingestItem(item)
            if (allPatterns.length > before) added++
          }
        }
        return { parsedCount, addedCount: added }
      }

      const baseTokenBudget = estimateDestinyPatternTokenBudget(userPrompt.length)
      const callOpts = {
        pool: 'fate',
        sessionId: fateSessionId,
        userSegments: kvPrepared.userSegments,
        jsonMode: !useStream,
        stream: useStream,
        onChunk: useStream
          ? (chunk: string) => {
              for (const item of streamParser!.feed(chunk)) {
                ingestItem(item)
              }
            }
          : undefined,
        maxTokensOverride: useStream ? bumpTokenBudget(baseTokenBudget) : baseTokenBudget,
        stablePrefixChars: kvPrepared.stablePrefixChars,
        storySeed: seed,
        outputSchema: destinyPatternPrompt.outputSchema,
        logContext: {
          callKind: useStream ? 'talent-generate-stream' : 'talent-generate-batch',
          batchIndex: batch + 1,
          totalBatches: AI_DESTINY_PATTERN_BATCH_COUNT,
        },
      }

      let response = await this.callAI!(
        destinyPatternPrompt.systemPrompt,
        userPrompt,
        callOpts,
      )
      if (!response?.trim()) {
        throw new Error(`批次 ${batch + 1}/${AI_DESTINY_PATTERN_BATCH_COUNT} API 返回空结果`)
      }
      const firstIngest = ingestResponse(response)

      console.info(
        `[destiny-pattern] 批次 ${batch + 1} 首响应 ${((performance.now() - t0) / 1000).toFixed(1)}s` +
        ` | 解析 ${firstIngest.parsedCount} 条 采纳 ${firstIngest.addedCount} 条` +
        ` | 当前池 ${allPatterns.length} 条`,
      )

      const responseComplete = response.trim().endsWith('}') || response.trim().endsWith(']')
      const looksTruncated = !responseComplete && firstIngest.parsedCount < AI_DESTINY_PATTERN_BATCH_SIZE / 2
      if (looksTruncated) {
        response = await this.callAI!(
          destinyPatternPrompt.systemPrompt,
          userPrompt,
          {
            ...callOpts,
            maxTokensOverride: bumpTokenBudget(callOpts.maxTokensOverride),
          },
        )
        if (!response?.trim()) {
          throw new Error(`批次 ${batch + 1}/${AI_DESTINY_PATTERN_BATCH_COUNT} 续写 API 返回空结果`)
        }
        ingestResponse(response)
      }

      if (allPatterns.length === countBefore) {
        throw new Error(`批次 ${batch + 1}/${AI_DESTINY_PATTERN_BATCH_COUNT} 解析结果为空`)
      }

      this.state.candidates = [...allPatterns]
      syncPoolStatus()
      onProgress?.(allPatterns.length, [...allPatterns])
      this.poolFillStatus.completedBatches = Math.max(this.poolFillStatus.completedBatches, batch + 1)
    }

    const runBatchWithRetry = async (batch: number, seed?: number, forceStream?: boolean): Promise<void> => {
      for (let attempt = 0; attempt < POOL_FILL_BATCH_RETRIES; attempt++) {
        try {
          await runBatch(batch, seed, forceStream)
          console.info(`[destiny-pattern] 批次 ${batch + 1}/${AI_DESTINY_PATTERN_BATCH_COUNT} 完成，当前池 ${allPatterns.length} 条`)
          return
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(
            `[destiny-pattern] 批次 ${batch + 1}/${AI_DESTINY_PATTERN_BATCH_COUNT} 第 ${attempt + 1} 次失败: ${msg}`,
          )
          if (attempt < POOL_FILL_BATCH_RETRIES - 1) {
            await new Promise((resolve) => setTimeout(resolve, POOL_FILL_RETRY_DELAY_MS * (attempt + 1)))
          }
        }
      }
    }

    const fireEarlyReady = (): void => {
      // AI 模式下不混入预设，但仍需等待 AI 积累够 12 条才切选取界面
      if (earlyReadyFired || allPatterns.length < DEFAULT_DESTINY_PATTERN_COUNT) return
      earlyReadyFired = true
      onEarlyReady?.([...allPatterns])
    }

    // ══════════ 3 路并行首批请求（不同 seed 确保差异化，强制流式） ══════════
    // ingestItem 内部在 allPatterns ≥ 12 时自动触发 onEarlyReady，任意一路先到即切选取界面
    // 每路有独立的 StreamingJsonArrayParser 实例，互不干扰；JS 单线程保证 push() 原子性
    // 考虑到每分钟 30 次 API 上限，并发 3 路 × 每路 3 次重试 = 最坏 9 次/轮，安全
    const PARALLEL_FIRST_COUNT = 3
    const PARALLEL_SEEDS = [42, 137, 256]
    const parallelPromises = PARALLEL_SEEDS.map((seed, i) => runBatchWithRetry(i, seed, true))
    let nextBackgroundBatch = PARALLEL_FIRST_COUNT

    // Promise.race：不必等最慢的批次，率先完成的批次若已达 12 条即触发 earlyReady
    await Promise.race(parallelPromises)
    // 检查首批结果是否已达 12 条（不足则等后续批次通过 ingestItem 累积触发）
    fireEarlyReady()

    if (!earlyReadyFired) {
      await Promise.race([earlyReadyPromise, Promise.allSettled(parallelPromises)])
      fireEarlyReady()
    }

    while (
      !earlyReadyFired
      && nextBackgroundBatch < AI_DESTINY_PATTERN_BATCH_COUNT
      && !this.poolFillAbortController?.signal.aborted
    ) {
      await runBatchWithRetry(nextBackgroundBatch)
      nextBackgroundBatch += 1
      fireEarlyReady()
    }

    const fillRemainingBatches = async (): Promise<void> => {
      try {
        // 等剩余并行批次完成，让它们在后台继续填充命格库
        await Promise.allSettled(parallelPromises)

        // 再串行填充后续批次（避免瞬间并发过多触发限流）
        for (let batch = nextBackgroundBatch; batch < AI_DESTINY_PATTERN_BATCH_COUNT; batch++) {
          if (this.poolFillAbortController?.signal.aborted) break
          if (allPatterns.length >= AI_DESTINY_PATTERN_BATCH_SIZE * AI_DESTINY_PATTERN_BATCH_COUNT) break
          await runBatchWithRetry(batch)
        }

        // AI 模式下不混入预设，有多少 AI 结果就保留多少
        this.state.candidates = [...allPatterns]
        console.info(`[destiny-pattern] 命格池填充完成: ${allPatterns.length}/${this.poolFillStatus.target} 条`)
      } finally {
        this.poolFillStatus.inProgress = false
        this.poolFillStatus.count = allPatterns.length
        this.poolFillAbortController = null
        persistPoolToLocal()
      }
    }

    this.poolFillPromise = fillRemainingBatches().finally(() => {
      this.poolFillPromise = null
      this.poolFillAbortController = null
    })

    return [...allPatterns]
  }

  /**
   * 从候选命格中选择指定 ID 的命格（选3，对齐废弃项目 validateTalentSelection）
   * 返回选中的命格数组，写入 state.patterns 并更新 rarityCount
   */
  selectPatterns(
    selectedIds: string[],
    candidatePool?: DestinyPattern[],
  ): DestinyPattern[] {
    if (selectedIds.length !== DESTINY_PATTERN_SELECT_COUNT) {
      throw new Error(`必须选择正好 ${DESTINY_PATTERN_SELECT_COUNT} 个命格（当前 ${selectedIds.length} 个）`)
    }

    const pool = candidatePool?.length ? candidatePool : this.state.candidates
    const idSet = new Set(selectedIds)
    const selected = pool.filter((p) => idSet.has(p.id))

    if (selected.length !== DESTINY_PATTERN_SELECT_COUNT) {
      const foundIds = new Set(selected.map((p) => p.id))
      const missing = selectedIds.filter((id) => !foundIds.has(id))
      throw new Error(`选择了无效的命格 ID: ${missing.join(', ')}`)
    }

    this.state.patterns = selected
    this.recountRarity()
    return selected
  }

  /** 清空候选命格列表（用于重新抽取） */
  clearCandidates(): void {
    this.state.candidates = []
  }

  /** 获取候选命格列表 */
  getCandidates(): DestinyPattern[] {
    return [...this.state.candidates]
  }

  /** 获取稀有度统计 */
  getRarityCount(): Record<DestinyPatternRarity, number> {
    return { ...this.state.rarityCount }
  }

  /** 获取命格列表 */
  getPatterns(): DestinyPattern[] {
    return [...this.state.patterns]
  }

  /** 获取命格属性加成汇总 */
  getAttrBonuses(): Partial<Record<string, number>> {
    const bonuses: Record<string, number> = {}
    for (const p of this.state.patterns) {
      if (p.attrBonus) {
        for (const [key, value] of Object.entries(p.attrBonus)) {
          if (typeof value === 'number') {
            bonuses[key] = (bonuses[key] ?? 0) + value
          }
        }
      }
    }
    return bonuses
  }

  // -------- 内部方法 --------

  private addPattern(pattern: DestinyPattern): void {
    this.state.patterns.push(pattern)
    this.state.rarityCount[pattern.rarity] = (this.state.rarityCount[pattern.rarity] ?? 0) + 1
  }

  private recountRarity(): void {
    this.state.rarityCount = { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0 }
    for (const p of this.state.patterns) {
      this.state.rarityCount[p.rarity] = (this.state.rarityCount[p.rarity] ?? 0) + 1
    }
  }

  private buildWeightedPool(pool: typeof PRESET_DESTINY_PATTERNS, already: DestinyPattern[]): typeof PRESET_DESTINY_PATTERNS {
    return pool.filter((t) => {
      const limit = DESTINY_PATTERN_RARITY_LIMITS[t.rarity]
      if (limit === undefined) return true
      const current = already.filter((p) => p.rarity === t.rarity).length
      return current < limit
    })
  }

  private weightedRandomIndex(pool: typeof PRESET_DESTINY_PATTERNS): number {
    const weights = pool.map((t) => DESTINY_PATTERN_RARITY_WEIGHTS[t.rarity] ?? 10)
    const totalWeight = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * totalWeight
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i] ?? 0
      if (r <= 0) return i
    }
    return pool.length - 1
  }

  private summarizeAttrBonuses(): string {
    const bonuses = this.getAttrBonuses()
    const entries = Object.entries(bonuses).filter(([, v]) => v !== 0)
    if (entries.length === 0) return ''
    const names: Record<string, string> = {
      physique: '体魄', mind: '心智', talentAptitude: '悟性', charisma: '魅力', resources: '出身',
    }
    return entries.map(([k, v]) => {
      const sign = (v ?? 0) > 0 ? '+' : ''
      return `${names[k] ?? k}${sign}${v}`
    }).join(' ')
  }

  // -------- AI 响应解析与校验 --------

  /** 内容质量门禁：长度 + common 单属性 + 禁止未来事件描述 */
  private passesContentQuality(item: DestinyPatternAIItem, startingAge = 0): boolean {
    const descLen = item.description?.length ?? 0
    if (descLen < DESTINY_PATTERN_DESC_MIN) return false
    if ((item.effect?.length ?? 0) < DESTINY_PATTERN_EFFECT_MIN) return false
    if (rejectsFutureDestinyPatternContent(item, startingAge)) return false
    if (rejectsBirthStateDestinyPatternContent(item)) return false
    if (item.rarity === 'common' && item.attrBonus) {
      const nonZero = Object.values(item.attrBonus).filter((v) => Number(v) !== 0).length
      if (nonZero > 1) return false
    }
    return true
  }

  /** 解析 AI 返回的 JSON 文本为结构化对象 */
  private parseAIResponse(response: string): Array<{
    name: string
    description: string
    rarity: string
    polarity: string
    effect: string
    attrBonus: Record<string, number>
    systemModifiers?: Record<string, number>
  }> {
    try {
      let jsonText = response.trim()
      const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)```/) || jsonText.match(/```\s*([\s\S]*?)```/)
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim()
      }

      const parsed = JSON.parse(jsonText)
      if (Array.isArray(parsed)) {
        return parsed
      }
      if (parsed && typeof parsed === 'object' && parsed.name) {
        return [parsed]
      }
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { patterns?: unknown }).patterns)) {
        return (parsed as { patterns: Array<{
          name: string
          description: string
          rarity: string
          polarity: string
          effect: string
          attrBonus: Record<string, number>
          systemModifiers?: Record<string, number>
        }> }).patterns
      }
      if (parsed && typeof parsed === 'object') {
        for (const val of Object.values(parsed)) {
          if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
            return val as Array<{
              name: string
              description: string
              rarity: string
              polarity: string
              effect: string
              attrBonus: Record<string, number>
              systemModifiers?: Record<string, number>
            }>
          }
        }
      }
      return []
    } catch {
      return []
    }
  }

  /** 校验稀有度值是否合法 */
  private validateRarity(rarity: string): DestinyPatternRarity | null {
    const valid: DestinyPatternRarity[] = ['common', 'fine', 'rare', 'epic', 'legendary']
    return valid.includes(rarity as DestinyPatternRarity) ? (rarity as DestinyPatternRarity) : null
  }

  /** 校验极性值是否合法 */
  private validatePolarity(polarity: string): DestinyPatternPolarity | null {
    const valid: DestinyPatternPolarity[] = ['positive', 'negative', 'mixed']
    return valid.includes(polarity as DestinyPatternPolarity) ? (polarity as DestinyPatternPolarity) : null
  }

  /** 校验并修正属性加成（钳制到 [-4, 4]） */
  private validateAttrBonus(
    bonus: Record<string, number> | undefined,
    rarity: string,
  ): Partial<Record<string, number>> {
    if (!bonus || typeof bonus !== 'object') return {}

    const validKeys = ['physique', 'mind', 'talentAptitude', 'charisma', 'resources']
    const result: Record<string, number> = {}
    const maxTotal = rarity === 'legendary' ? 7 : rarity === 'epic' ? 5 : rarity === 'rare' ? 4 : rarity === 'fine' ? 3 : 1

    let total = 0
    for (const key of validKeys) {
      const val = Number(bonus[key])
      if (isNaN(val) || val === 0) continue
      const clamped = clamp(val, -4, 4)
      result[key] = clamped
      total += Math.abs(clamped)
    }

    // 总和超限则按比例缩放
    if (total > maxTotal && total > 0) {
      const scale = maxTotal / total
      for (const key of Object.keys(result)) {
        result[key] = Math.round((result[key] ?? 0) * scale)
      }
    }

    return result
  }

  private getRarityLabel(rarity: DestinyPatternRarity): string {
    const labels: Record<DestinyPatternRarity, string> = {
      common: '普通', fine: '精良', rare: '稀有', epic: '史诗', legendary: '传说',
    }
    return labels[rarity] ?? rarity
  }
}
