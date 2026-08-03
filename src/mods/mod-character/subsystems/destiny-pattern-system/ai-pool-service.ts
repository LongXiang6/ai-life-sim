/**
 * Purpose: Run the destiny-pattern AI pool lifecycle, retries, streaming ingestion, and background fill.
 * Owner: mod-character
 * Responsibility: Own transient AI call state while publishing candidate snapshots to the character subsystem.
 */

import { isAiCredentialError } from '@/core/ai-service'
import { bumpTokenBudget } from '@/foundation'
import {
  AI_DESTINY_PATTERN_BATCH_COUNT,
  AI_DESTINY_PATTERN_BATCH_SIZE,
  AI_DESTINY_PATTERN_FIRST_SCREEN_CONCURRENCY,
  DESTINY_PATTERN_EARLY_READY_COUNT,
  DESTINY_PATTERN_ID_PREFIX,
} from '../../constants'
import {
  buildDestinyPatternUserPromptKv,
  estimateDestinyPatternTokenBudget,
  type BuildDestinyPatternContextInput,
} from '../../prompts/destiny-pattern-context'
import { destinyPatternPrompt } from '../../prompts/destiny-pattern-prompt'
import type { DestinyPattern } from '../../types'
import { buildFateKvSessionId } from '../../utils/fate-kv'
import { saveDestinyPatternPool } from '../../utils/destiny-pattern-pool-cache'
import { StreamingJsonArrayParser } from '../../utils/streaming-json-array-parser'
import { validatePatternSystemModifiers } from '../../utils/destiny-pattern-modifiers'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import type {
  DestinyPatternAIGenerateOptions,
  DestinyPatternAIItem,
  DestinyPatternAiCaller,
  DestinyPatternPoolFillStatus,
} from './contracts'
import {
  dedupeDestinyPatterns,
  destinyPatternNameKey,
  isAIGeneratedDestinyPattern,
  parseDestinyPatternAIResponse,
  passesDestinyPatternContentQuality,
  validateDestinyPatternAttrBonus,
  validateDestinyPatternPolarity,
  validateDestinyPatternRarity,
} from './validation'

const POOL_FILL_BATCH_RETRIES = 2
const POOL_FILL_RETRY_DELAY_MS = 1000

export class DestinyPatternAiPoolService {
  private callAI: DestinyPatternAiCaller | null = null
  private poolFillPromise: Promise<void> | null = null
  private poolFillAbortController: AbortController | null = null
  private poolFillStatus: DestinyPatternPoolFillStatus = {
    inProgress: false,
    count: 0,
    target: AI_DESTINY_PATTERN_BATCH_SIZE * AI_DESTINY_PATTERN_BATCH_COUNT,
    completedBatches: 0,
    totalBatches: AI_DESTINY_PATTERN_BATCH_COUNT,
  }

  constructor(private readonly setCandidates: (patterns: DestinyPattern[]) => void) {}

  getPoolFillStatus(): DestinyPatternPoolFillStatus {
    return { ...this.poolFillStatus }
  }

  abortPoolFill(): void {
    this.poolFillAbortController?.abort()
    this.poolFillAbortController = null
    this.poolFillPromise = null
    this.poolFillStatus = { ...this.poolFillStatus, inProgress: false }
  }

  setAIService(callAI: DestinyPatternAiCaller): void {
    this.callAI = callAI
  }

async generateWithAI(
  contextInput: BuildDestinyPatternContextInput,
  onProgress?: (count: number, patterns: DestinyPattern[]) => void,
  onEarlyReady?: (patterns: DestinyPattern[]) => void,
  onBatchStart?: (batchIndex: number) => void,
  options?: DestinyPatternAIGenerateOptions,
): Promise<DestinyPattern[]> {
  if (!this.callAI) {
    throw new Error('[destiny-pattern] AI 服务未就绪，请重试')
  }

  // 中止旧的后台填充，防止并发状态污染
  this.abortPoolFill()

  const targetCount = Math.max(
    DESTINY_PATTERN_EARLY_READY_COUNT,
    options?.targetCount ?? AI_DESTINY_PATTERN_BATCH_SIZE * AI_DESTINY_PATTERN_BATCH_COUNT,
  )
  const seededPatterns = dedupeDestinyPatterns(options?.initialPatterns ?? [])
    .filter((pattern) => isAIGeneratedDestinyPattern(pattern))
    .slice(0, targetCount)
  const allPatterns: DestinyPattern[] = [...seededPatterns]
  const existingNames: string[] = seededPatterns.map((p) => p.name)
  const existingNameKeys = new Set(existingNames.map(destinyPatternNameKey))
  let earlyReadyFired = false
  const startingAge = contextInput.character.startingAge ?? 0

  const abortController = new AbortController()
  this.poolFillAbortController = abortController
  this.poolFillStatus = {
    inProgress: true,
    count: allPatterns.length,
    target: targetCount,
    completedBatches: 0,
    totalBatches: AI_DESTINY_PATTERN_BATCH_COUNT,
  }
  this.setCandidates([...allPatterns])

  const syncPoolStatus = () => {
    this.poolFillStatus.count = allPatterns.length
  }

  const persistPoolToLocal = () => {
    saveDestinyPatternPool(useWorldStore.getState().worldCode, [...allPatterns])
  }

  let resolveEarlyReady: (() => void) | null = null
  const earlyReadyPromise = new Promise<void>((resolve) => {
    resolveEarlyReady = resolve
  })
  let terminalCredentialError: unknown = null
  let resolveTerminalCredentialError: (() => void) | null = null
  const terminalCredentialErrorPromise = new Promise<void>((resolve) => {
    resolveTerminalCredentialError = resolve
  })

  const stopForCredentialError = (error: unknown): void => {
    if (terminalCredentialError) return
    terminalCredentialError = error
    abortController.abort()
    resolveTerminalCredentialError?.()
    resolveTerminalCredentialError = null
  }

  const fireEarlyReady = (): void => {
    if (earlyReadyFired || allPatterns.length < DESTINY_PATTERN_EARLY_READY_COUNT) return
    earlyReadyFired = true
    onEarlyReady?.([...allPatterns])
    resolveEarlyReady?.()
    resolveEarlyReady = null
  }

  const ingestItem = (item: DestinyPatternAIItem) => {
    const normalizedName = item?.name?.trim()
    const nameKey = normalizedName ? destinyPatternNameKey(normalizedName) : ''
    if (!normalizedName || existingNameKeys.has(nameKey)) return
    if (allPatterns.length >= targetCount) return
    if (!passesDestinyPatternContentQuality(item, startingAge)) return

    const rarity = validateDestinyPatternRarity(item.rarity)
    const polarity = validateDestinyPatternPolarity(item.polarity)
    if (!rarity || !polarity) return
    const pattern: DestinyPattern = {
      id: `${DESTINY_PATTERN_ID_PREFIX.AI}-${Date.now()}-${allPatterns.length}`,
      name: normalizedName,
      description: item.description,
      rarity,
      polarity,
      effect: item.effect,
      attrBonus: validateDestinyPatternAttrBonus(item.attrBonus, item.rarity),
      systemModifiers: validatePatternSystemModifiers(
        item.systemModifiers != null && typeof item.systemModifiers === 'object'
          ? (item.systemModifiers as Record<string, unknown>)
          : undefined,
        rarity,
      ),
    }

    allPatterns.push(pattern)
    existingNames.push(normalizedName)
    existingNameKeys.add(nameKey)
    this.setCandidates([...allPatterns])
    syncPoolStatus()
    onProgress?.(allPatterns.length, [...allPatterns])
    persistPoolToLocal()

    fireEarlyReady()
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
      const parsed = parseDestinyPatternAIResponse(response)
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
      signal: abortController.signal,
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

    this.setCandidates([...allPatterns])
    syncPoolStatus()
    onProgress?.(allPatterns.length, [...allPatterns])
    this.poolFillStatus.completedBatches = Math.max(this.poolFillStatus.completedBatches, batch + 1)
  }

  const runBatchWithRetry = async (batch: number, seed?: number, forceStream?: boolean): Promise<void> => {
    for (let attempt = 0; attempt < POOL_FILL_BATCH_RETRIES; attempt++) {
      if (abortController.signal.aborted) return
      try {
        await runBatch(batch, seed, forceStream)
        console.info(`[destiny-pattern] 批次 ${batch + 1}/${AI_DESTINY_PATTERN_BATCH_COUNT} 完成，当前池 ${allPatterns.length} 条`)
        return
      } catch (err) {
        if (isAiCredentialError(err)) {
          stopForCredentialError(err)
          throw terminalCredentialError
        }
        // 页面离开或流程取消时，AbortController 触发的是预期的清理路径，
        // 不应把它记录成 API 失败警告或让用户误以为命格生成出错。
        if (abortController.signal.aborted) return
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(
          `[destiny-pattern] 批次 ${batch + 1}/${AI_DESTINY_PATTERN_BATCH_COUNT} 第 ${attempt + 1} 次失败: ${msg}`,
        )
        if (attempt < POOL_FILL_BATCH_RETRIES - 1 && !abortController.signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, POOL_FILL_RETRY_DELAY_MS * (attempt + 1)))
        }
      }
    }
  }

  try {
    // 首屏同时发起三路独立的 10 项流式请求。任一路或任意组合累计出 5 条
    // 有效去重命格就立即触发页面交接；其余请求不阻塞交接，继续由后台收集。
    let nextBackgroundBatch = 0
    const parallelPromises: Promise<void>[] = []
    fireEarlyReady()

    if (!earlyReadyFired && !abortController.signal.aborted) {
      const parallelSeeds = [42, 137, 256].slice(0, AI_DESTINY_PATTERN_FIRST_SCREEN_CONCURRENCY)
      parallelPromises.push(
        ...parallelSeeds.map((seed, index) => runBatchWithRetry(index, seed, true)),
      )
      nextBackgroundBatch = parallelSeeds.length

      const allParallelSettled = Promise.allSettled(parallelPromises).then(() => undefined)
      await Promise.race([earlyReadyPromise, allParallelSettled, terminalCredentialErrorPromise])
      if (terminalCredentialError) throw terminalCredentialError
      fireEarlyReady()
    }

    // 三路都结束但仍未达到 5 条时，继续单路请求；不设置人为批次数上限。
    // 401/403 是配置终止错误，会中止并退出；其余单次失败仍按原规则继续等待。
    while (!earlyReadyFired && !abortController.signal.aborted) {
      await runBatchWithRetry(
        nextBackgroundBatch,
      )
      nextBackgroundBatch += 1
      fireEarlyReady()
    }

    const fillRemainingBatches = async (): Promise<void> => {
      try {
        // 首屏可选后再串行填充后续批次；先等仍在运行的首屏请求写入共享池。
        if (parallelPromises.length > 0) {
          await Promise.allSettled(parallelPromises)
        }
        for (let batch = nextBackgroundBatch; batch < AI_DESTINY_PATTERN_BATCH_COUNT; batch++) {
          if (abortController.signal.aborted) break
          if (allPatterns.length >= targetCount) break
          await runBatchWithRetry(batch)
        }

        // AI 模式下不混入预设，有多少 AI 结果就保留多少
        this.setCandidates([...allPatterns])
        console.info(`[destiny-pattern] 命格池填充完成: ${allPatterns.length}/${this.poolFillStatus.target} 条`)
      } catch (error) {
        if (!isAiCredentialError(error)) throw error
        console.warn('[destiny-pattern] 凭据或权限错误，已停止后台命格池填充')
      } finally {
        if (this.poolFillAbortController === abortController) {
          this.poolFillStatus.inProgress = false
          this.poolFillStatus.count = allPatterns.length
          this.poolFillAbortController = null
          persistPoolToLocal()
        }
      }
    }

    const backgroundFillPromise = fillRemainingBatches()
    this.poolFillPromise = backgroundFillPromise
    void backgroundFillPromise.finally(() => {
      if (this.poolFillPromise === backgroundFillPromise) {
        this.poolFillPromise = null
      }
      if (this.poolFillAbortController === abortController) {
        this.poolFillAbortController = null
      }
    })

    return [...allPatterns]
  } catch (error) {
    abortController.abort()
    this.poolFillStatus.inProgress = false
    this.poolFillStatus.count = allPatterns.length
    if (this.poolFillAbortController === abortController) {
      this.poolFillAbortController = null
    }
    persistPoolToLocal()
    throw error
  }
}
}
