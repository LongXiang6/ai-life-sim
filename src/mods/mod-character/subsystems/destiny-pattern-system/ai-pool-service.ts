/**
 * Purpose: Coordinate five category-scoped destiny-pattern requests and their background fill.
 * Owner: mod-character
 * Responsibility: Own request coordination, item-level parsing, candidate publication, and pool-cache writes.
 */

import {
  DESTINY_PATTERN_CATEGORY_INITIAL_COUNT,
  DESTINY_PATTERN_CATEGORY_ORDER,
  DESTINY_PATTERN_CATEGORY_TARGET_COUNT,
  DESTINY_PATTERN_ID_PREFIX,
} from '../../constants'
import { buildDestinyPatternSystemPrompt } from '../../prompts/destiny-pattern-prompt'
import {
  buildDestinyPatternUserPromptKv,
  type BuildDestinyPatternContextInput,
} from '../../prompts/destiny-pattern-context'
import type { DestinyPattern, DestinyPatternCategory } from '../../types'
import { withInitialDestinyPatternGrowthIdentity } from '../../destiny-pattern-growth'
import { buildFateKvSessionId } from '../../utils/fate-kv'
import { saveDestinyPatternPool } from '../../utils/destiny-pattern-pool-cache'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import type {
  DestinyPatternAIItem,
  DestinyPatternAiCaller,
  DestinyPatternCategoryFillStatus,
  DestinyPatternPoolFillStatus,
  DestinyPatternPoolListener,
} from './contracts'
import {
  dedupeDestinyPatterns,
  normalizeCommonDestinyPatternCandidate,
  parseDestinyPatternAIResponse,
  validateDestinyPatternAttrBonus,
  validateDestinyPatternCategory,
} from './validation'

function normalizeCandidates(patterns: DestinyPattern[]): DestinyPattern[] {
  return patterns
    .map(normalizeCommonDestinyPatternCandidate)
    .filter((pattern): pattern is DestinyPattern => pattern !== null)
}

function createCategoryStatus(category: DestinyPatternCategory): DestinyPatternCategoryFillStatus {
  return {
    category,
    count: 0,
    initialReady: false,
    inProgress: false,
    status: 'idle',
  }
}

function createPoolStatus(): DestinyPatternPoolFillStatus {
  return {
    phase: 'idle',
    inProgress: false,
    count: 0,
    target: DESTINY_PATTERN_CATEGORY_ORDER.length * DESTINY_PATTERN_CATEGORY_TARGET_COUNT,
    initialReady: false,
    categories: Object.fromEntries(
      DESTINY_PATTERN_CATEGORY_ORDER.map((category) => [category, createCategoryStatus(category)]),
    ) as Record<DestinyPatternCategory, DestinyPatternCategoryFillStatus>,
  }
}

export class DestinyPatternAiPoolService {
  private callAI: DestinyPatternAiCaller | null = null
  private activeAbortController: AbortController | null = null
  private backgroundPromise: Promise<DestinyPattern[]> | null = null
  private currentContext: BuildDestinyPatternContextInput | null = null
  private currentPatterns: DestinyPattern[] = []
  private readonly listeners = new Set<DestinyPatternPoolListener>()
  private poolFillStatus: DestinyPatternPoolFillStatus = createPoolStatus()

  constructor(private readonly setCandidates: (patterns: DestinyPattern[]) => void) {}

  getPoolFillStatus(): DestinyPatternPoolFillStatus {
    return structuredClone(this.poolFillStatus)
  }

  subscribe(listener: DestinyPatternPoolListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  abortPoolFill(): void {
    this.activeAbortController?.abort()
    this.activeAbortController = null
    this.backgroundPromise = null
    const next = structuredClone(this.poolFillStatus)
    next.inProgress = false
    next.phase = 'idle'
    for (const category of DESTINY_PATTERN_CATEGORY_ORDER) {
      const state = next.categories[category]
      if (state.inProgress) {
        state.inProgress = false
        state.status = 'cancelled'
      }
    }
    this.poolFillStatus = next
    this.publish()
  }

  setAIService(callAI: DestinyPatternAiCaller): void {
    this.callAI = callAI
  }

  /** Restore a cached candidate pool into the transient runtime lifecycle. */
  hydratePool(patterns: DestinyPattern[]): void {
    const normalizedPatterns = normalizeCandidates(patterns)
    if (normalizedPatterns.length === 0) return

    this.currentPatterns = dedupeDestinyPatterns(
      this.poolFillStatus.inProgress
        ? [...this.currentPatterns, ...normalizedPatterns]
        : normalizedPatterns,
    )
    this.poolFillStatus.count = this.currentPatterns.length
    for (const category of DESTINY_PATTERN_CATEGORY_ORDER) {
      const state = this.poolFillStatus.categories[category]
      state.count = this.countCategory(category)
      if (this.poolFillStatus.inProgress) continue
      state.initialReady = state.count >= DESTINY_PATTERN_CATEGORY_INITIAL_COUNT
      state.status = state.initialReady ? 'complete' : 'idle'
    }
    if (!this.poolFillStatus.inProgress) {
      this.poolFillStatus.initialReady = DESTINY_PATTERN_CATEGORY_ORDER.every(
        (category) => this.poolFillStatus.categories[category].initialReady,
      )
    }
    this.publish()
  }

  async generateWithAI(contextInput: BuildDestinyPatternContextInput): Promise<DestinyPattern[]> {
    if (!this.callAI) throw new Error('[destiny-pattern] AI 服务未就绪')

    this.abortPoolFill()
    const abortController = new AbortController()
    this.activeAbortController = abortController
    this.currentContext = contextInput
    this.currentPatterns = []
    this.poolFillStatus = createPoolStatus()
    this.poolFillStatus.phase = 'initial'
    this.poolFillStatus.inProgress = true
    for (const category of DESTINY_PATTERN_CATEGORY_ORDER) this.poolFillStatus.categories[category].inProgress = true
    this.publish()

    const settings = useSettingsStore.getState()
    const model = settings.customModel
    const sessionId = buildFateKvSessionId(useWorldStore.getState().worldCode)
    const generationId = Date.now()
    const results = await Promise.allSettled(
      DESTINY_PATTERN_CATEGORY_ORDER.map((category, categoryIndex) => this.callCategory(
        contextInput,
        category,
        'initial',
        categoryIndex,
        generationId,
        abortController.signal,
        model,
        sessionId,
      )),
    )

    if (abortController.signal.aborted) throw new Error('命格生成已取消')

    const failures: string[] = []
    const terminalErrors: unknown[] = []
    for (const [categoryIndex, result] of results.entries()) {
      const category = DESTINY_PATTERN_CATEGORY_ORDER[categoryIndex]
      if (result.status === 'rejected') {
        terminalErrors.push(result.reason)
        this.failCategory(category, result.reason instanceof Error ? result.reason.message : '分类调用失败')
        failures.push(`${category}分类调用失败`)
        continue
      }
      const parsed = parseDestinyPatternAIResponse(result.value, category)
      this.mergeItems(parsed, category, generationId, categoryIndex)
      const state = this.poolFillStatus.categories[category]
      state.count = this.countCategory(category)
      state.initialReady = state.count >= DESTINY_PATTERN_CATEGORY_INITIAL_COUNT
      state.inProgress = false
      state.status = state.initialReady ? 'complete' : 'failed'
      if (!state.initialReady) failures.push(`${category}分类首批不足 ${DESTINY_PATTERN_CATEGORY_INITIAL_COUNT} 条`)
    }

    this.poolFillStatus.count = this.currentPatterns.length
    this.poolFillStatus.initialReady = DESTINY_PATTERN_CATEGORY_ORDER.every(
      (category) => this.poolFillStatus.categories[category].initialReady,
    ) && failures.length === 0
    this.poolFillStatus.inProgress = false
    this.poolFillStatus.phase = 'idle'
    this.publish()

    if (!this.poolFillStatus.initialReady) {
      if (terminalErrors.length === DESTINY_PATTERN_CATEGORY_ORDER.length && terminalErrors[0]) {
        throw terminalErrors[0]
      }
      throw new Error(`命格首批生成未完成：${failures.join('；') || '缺少可用分类'}`)
    }
    return [...this.currentPatterns]
  }

  startBackgroundFill(
    contextInput = this.currentContext,
    initialPatterns: DestinyPattern[] = [],
  ): Promise<DestinyPattern[]> {
    if (!this.callAI) return Promise.reject(new Error('[destiny-pattern] AI 服务未就绪'))
    if (this.backgroundPromise) return this.backgroundPromise
    if (!contextInput) return Promise.resolve([...this.currentPatterns])

    if (initialPatterns.length > 0) {
      this.currentPatterns = dedupeDestinyPatterns(
        [...this.currentPatterns, ...normalizeCandidates(initialPatterns)],
      )
      for (const category of DESTINY_PATTERN_CATEGORY_ORDER) {
        const state = this.poolFillStatus.categories[category]
        state.count = this.countCategory(category)
        state.initialReady = state.count >= DESTINY_PATTERN_CATEGORY_INITIAL_COUNT
      }
      this.poolFillStatus.count = this.currentPatterns.length
      this.poolFillStatus.initialReady = DESTINY_PATTERN_CATEGORY_ORDER.every(
        (category) => this.poolFillStatus.categories[category].initialReady,
      )
      this.publish()
    }

    const abortController = new AbortController()
    this.activeAbortController = abortController
    this.currentContext = contextInput
    this.poolFillStatus.phase = 'background'
    this.poolFillStatus.inProgress = true
    for (const category of DESTINY_PATTERN_CATEGORY_ORDER) {
      const state = this.poolFillStatus.categories[category]
      state.inProgress = state.count < DESTINY_PATTERN_CATEGORY_TARGET_COUNT
      state.status = state.inProgress ? 'running' : 'complete'
    }
    this.publish()

    const settings = useSettingsStore.getState()
    const model = settings.customModel
    const sessionId = buildFateKvSessionId(useWorldStore.getState().worldCode)
    const generationId = Date.now()
    this.backgroundPromise = Promise.all(
      DESTINY_PATTERN_CATEGORY_ORDER.map((category, categoryIndex) => this.fillCategory(
        contextInput,
        category,
        categoryIndex,
        generationId,
        abortController.signal,
        model,
        sessionId,
      )),
    ).then(() => {
      this.poolFillStatus.count = this.currentPatterns.length
      this.poolFillStatus.inProgress = false
      this.poolFillStatus.phase = 'idle'
      this.publish()
      return [...this.currentPatterns]
    }).finally(() => {
      if (this.activeAbortController === abortController) this.activeAbortController = null
      this.backgroundPromise = null
    })
    return this.backgroundPromise
  }

  private async fillCategory(
    contextInput: BuildDestinyPatternContextInput,
    category: DestinyPatternCategory,
    categoryIndex: number,
    generationId: number,
    signal: AbortSignal,
    model: string,
    sessionId: string,
  ): Promise<void> {
    let batchIndex = 0
    while (!signal.aborted && this.countCategory(category) < DESTINY_PATTERN_CATEGORY_TARGET_COUNT) {
      const state = this.poolFillStatus.categories[category]
      state.inProgress = true
      state.status = 'running'
      const before = this.countCategory(category)
      try {
        const response = await this.callCategory(
          contextInput,
          category,
          'background',
          batchIndex,
          generationId + batchIndex + 1,
          signal,
          model,
          sessionId,
        )
        const parsed = parseDestinyPatternAIResponse(response, category)
        this.mergeItems(parsed, category, generationId + batchIndex + 1, categoryIndex)
        state.count = this.countCategory(category)
        this.publish()
        if (state.count === before) {
          this.failCategory(category, '补充响应没有新增可用命格')
          return
        }
        batchIndex += 1
      } catch (error) {
        if (signal.aborted) return
        this.failCategory(category, error instanceof Error ? error.message : '后台补充失败')
        return
      }
    }
    const state = this.poolFillStatus.categories[category]
    state.count = this.countCategory(category)
    state.inProgress = false
    state.status = signal.aborted ? 'cancelled' : state.count >= DESTINY_PATTERN_CATEGORY_TARGET_COUNT ? 'complete' : state.status
    this.publish()
  }

  private async callCategory(
    contextInput: BuildDestinyPatternContextInput,
    category: DestinyPatternCategory,
    phase: 'initial' | 'background',
    batchIndex: number,
    generationId: number,
    signal: AbortSignal,
    model: string,
    sessionId: string,
  ): Promise<string> {
    const promptInput = buildDestinyPatternUserPromptKv({
      ...contextInput,
      existingNames: this.currentPatterns.map((pattern) => pattern.name),
      existingPatterns: this.currentPatterns
        .filter((pattern) => pattern.category === category)
        .map((pattern) => ({
          name: pattern.name,
          description: pattern.description,
          effect: pattern.effect,
        })),
    })
    return this.callAI!(
      buildDestinyPatternSystemPrompt(category),
      promptInput.userPrompt,
      {
        pool: 'fate',
        sessionId,
        userSegments: promptInput.userSegments,
        jsonMode: true,
        stream: false,
        signal,
        outputSchema: undefined,
        stablePrefixChars: promptInput.stablePrefixChars,
        logContext: {
          callKind: `talent-generate-${phase}-${category}-${generationId}-${batchIndex + 1}`,
          pool: 'fate',
          model,
          sessionId,
        },
      },
    )
  }

  private mergeItems(
    parsed: DestinyPatternAIItem[],
    expectedCategory: DestinyPatternCategory,
    generationId: number,
    categoryIndex: number,
  ): number {
    const additions: DestinyPattern[] = []
    for (const [slotIndex, item] of parsed.entries()) {
      try {
        const category = validateDestinyPatternCategory(item.category)
        const name = item.name.trim()
        if (category !== expectedCategory || !name) continue
        const id = `${DESTINY_PATTERN_ID_PREFIX.AI}-${generationId}-${categoryIndex}-${slotIndex}`
        const attrBonus = validateDestinyPatternAttrBonus(item.attrBonus, 'common')
        additions.push(withInitialDestinyPatternGrowthIdentity({
          id,
          name,
          description: item.description.trim(),
          category,
          rarity: 'common',
          effect: item.effect.trim(),
          attrBonus,
        }, id))
      } catch {
        // 保留批次中其余合规候选；越界条目不做点数截断。
      }
    }
    if (additions.length === 0) return 0
    const existingIds = new Set(this.currentPatterns.map((pattern) => pattern.id))
    this.currentPatterns = dedupeDestinyPatterns([...this.currentPatterns, ...additions])
    const addedCount = this.currentPatterns.filter((pattern) => !existingIds.has(pattern.id)).length
    this.poolFillStatus.count = this.currentPatterns.length
    saveDestinyPatternPool(useWorldStore.getState().worldCode, this.currentPatterns)
    this.publish()
    return addedCount
  }

  private countCategory(category: DestinyPatternCategory): number {
    return this.currentPatterns.filter((pattern) => pattern.category === category).length
  }

  private failCategory(category: DestinyPatternCategory, error: string): void {
    const state = this.poolFillStatus.categories[category]
    state.inProgress = false
    state.status = 'failed'
    state.error = error
    state.count = this.countCategory(category)
    this.publish()
  }

  private publish(): void {
    this.setCandidates([...this.currentPatterns])
    const status = this.getPoolFillStatus()
    for (const listener of this.listeners) listener([...this.currentPatterns], status)
  }
}
