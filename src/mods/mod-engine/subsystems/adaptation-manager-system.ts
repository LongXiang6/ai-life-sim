/**
 * @module adaptation-manager-system
 * @description AI 适配管线 —— 将子系统硬编码 summary 通过 AI 翻译为世界观贴切的叙事文本
 * @mod mod-engine
 *
 * 时序：
 *   Round N：
 *     assemblePromptContext() → getAdaptedSummaries() → 首次无缓存，返回原始 summary（零退化）
 *     callAI → 生成叙事 → 返回给玩家
 *     adaptPending() → 后台异步调 AI 适配 → 写入缓存
 *   Round N+1：
 *     assemblePromptContext() → getAdaptedSummaries() → 缓存命中 → 返回世界观适配文本
 *
 * 缓存 key：subsystemId::hash(summary)
 * 每类事件在整个游戏中只调 1 次 AI，后续全部走缓存。
 */

import type { AIModelConfig } from '@/foundation'
import type { UnifiedCallOptions } from '@/core'

import { callAIWithPromptTemplate } from '@/core'

import { ADAPTATION_PROMPT_MAP } from '../helpers/adaptation-prompt-registry.generated'

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 待适配的子系统摘要 */
interface PendingAdaptation {
  subsystemId: string
  rawSummary: string
  cacheKey: string
}

/**
 * 这些 summary 是 owning system 已确认事实的确定性投影，禁止由后台世界观适配器
 * 改写、概括或替换。即使未来误登记了 adaptation Prompt，也必须保持原文。
 */
const DETERMINISTIC_PROMPT_SUMMARY_IDS = new Set([
  'historical-event-ledger',
])

export function bypassWorldviewAdaptation(subsystemId: string): boolean {
  return DETERMINISTIC_PROMPT_SUMMARY_IDS.has(subsystemId)
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 简单 hash（djb2），用于缓存 key */
function simpleHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** 构建 adaptation 调用所需的用户 prompt */
function fillAdaptationUserPrompt(
  rawSummary: string,
  worldviewText: string,
  promptTemplate: { userPromptTemplate: string },
): string {
  let filled = promptTemplate.userPromptTemplate
  // 替换常见变量
  filled = filled.replace(/\{\{worldCalibrationSummary\}\}/g, worldviewText)
  filled = filled.replace(/\{\{subsystemSummary\}\}/g, rawSummary)
  filled = filled.replace(/\{\{fortuneEvent\}\}/g, rawSummary)
  filled = filled.replace(/\{\{rawData\}\}/g, rawSummary)
  // 保留剩余未替换的变量（AI 端自行处理默认值）
  return filled
}

/** 从 AI 适配输出中提取适配后的文本 */
function extractAdaptedText(content: string): string | undefined {
  try {
    const parsed = JSON.parse(content)
    // 优先取 narrativeHint / narrativeHints
    if (typeof parsed.narrativeHint === 'string' && parsed.narrativeHint) {
      return parsed.narrativeHint
    }
    if (Array.isArray(parsed.narrativeHints) && parsed.narrativeHints.length) {
      return parsed.narrativeHints.filter((value: unknown) => typeof value === 'string' && value).join('；')
    }
    if (typeof parsed.name === 'string' && typeof parsed.description === 'string') {
      return `${parsed.name}：${parsed.description}`
    }
    if (typeof parsed.realmName === 'string' && parsed.realmName) {
      const hints = Array.isArray(parsed.narrativeHints) ? parsed.narrativeHints.join('；') : ''
      return `${parsed.realmName}${hints ? '——' + hints : ''}`
    }
    // 兜底：保留全部字符串字段，避免只取第一项丢失适配语义。
    const values = Object.values(parsed).filter((v): v is string => typeof v === 'string' && v.length > 0)
    if (values.length > 0) return values.join('；')
  } catch {
    // JSON parse failed → 保留完整原始内容，由上层决定是否接受。
  }
  return content || undefined
}

// ---------------------------------------------------------------------------
// AdaptationManager
// ---------------------------------------------------------------------------

export class AdaptationManager {
  /** 缓存：key 同时包含摘要、世界、会话和非敏感模型路由。 */
  private cache = new Map<string, string>()

  /** 失败计数：key = 完整 cacheKey → 连续失败次数（3 次后跳过该配置组合） */
  private failureCounts = new Map<string, number>()

  /** 同一 cacheKey 的在途请求只允许一个。 */
  private inFlight = new Map<string, Promise<string>>()

  /** clear() 后让旧世界仍在途的适配结果失效。 */
  private generation = 0

  /** AI 配置（由 orchestrator 每轮注入） */
  private aiConfig: AIModelConfig | null = null
  private aiRouteOptions: Pick<UnifiedCallOptions, 'providerId' | 'apiKey' | 'customBaseUrl' | 'customModel'> = {}
  private sessionId: string | undefined

  /** 世界观适配文本（用于填充 prompt 变量） */
  private worldviewText = ''

  // -----------------------------------------------------------------------
  // 公共方法
  // -----------------------------------------------------------------------

  /** 设置 AI 配置（每轮开始前由 orchestrator 注入） */
  setAiConfig(
    config: AIModelConfig,
    sessionId?: string,
    routeOptions: Pick<UnifiedCallOptions, 'providerId' | 'apiKey' | 'customBaseUrl' | 'customModel'> = {},
  ): void {
    this.aiConfig = config
    this.sessionId = sessionId
    this.aiRouteOptions = routeOptions
  }

  /** 设置世界观元信息（用于填充 adaptation prompt 的世界观变量） */
  setWorldviewText(essenceTag: string, description: string): void {
    this.worldviewText = `世界观本质：${essenceTag}\n世界描述：${description}`
  }

  /**
   * 获取适配后的 summaries（同步，用于 assemblePromptContext）
   *   - 缓存命中 → 返回适配文本
   *   - 缓存未命中 → 返回原始 summary，标记为 pending
   */
  getAdaptedSummaries(
    states: Array<{ id: string; summary: string }>,
  ): Map<string, string> {
    const result = new Map<string, string>()

    for (const s of states) {
      if (!s.summary) continue
      if (bypassWorldviewAdaptation(s.id)) {
        result.set(s.id, s.summary)
        continue
      }
      const cacheKey = this.buildCacheKey(s.id, s.summary)

      if (this.cache.has(cacheKey)) {
        result.set(s.id, this.cache.get(cacheKey)!)
      } else {
        // 缓存未命中 → 返回原始 summary（零退化）
        result.set(s.id, s.summary)
      }
    }

    return result
  }

  /**
   * 获取当前累积的 pending 适配项（供 orchestrator 决定是否触发后台适配）
   *   — 缓存未命中 + 有对应 adaptation prompt + 失败计数 < 3
   */
  getPendingAdaptations(
    states: Array<{ id: string; summary: string }>,
  ): PendingAdaptation[] {
    const pending: PendingAdaptation[] = []

    for (const s of states) {
      if (!s.summary) continue
      if (bypassWorldviewAdaptation(s.id)) continue
      const cacheKey = this.buildCacheKey(s.id, s.summary)
      if (this.cache.has(cacheKey)) continue // 已缓存
      if (this.inFlight.has(cacheKey)) continue // 已在后台适配

      const prompt = ADAPTATION_PROMPT_MAP[s.id]
      if (!prompt) continue // 无对应 adaptation prompt

      const failures = this.failureCounts.get(cacheKey) ?? 0
      if (failures >= 3) continue // 永久跳过

      pending.push({ subsystemId: s.id, rawSummary: s.summary, cacheKey })
    }

    return pending
  }

  /**
   * 后台异步适配（在 executeRoundV2 末尾调用，不阻塞主叙事流）
   *   — 限制并发 3 个
   *   — 单个超时 8 秒
   *   — 失败 3 次后永久跳过该子系统
   */
  async adaptPending(states: Array<{ id: string; summary: string }>): Promise<void> {
    const pending = this.getPendingAdaptations(states)
    if (!pending.length || !this.aiConfig) return
    const generation = this.generation

    // 限制并发：最多 3 个同时
    const CONCURRENCY_LIMIT = 3
    const TIMEOUT_MS = 8_000

    for (let i = 0; i < pending.length; i += CONCURRENCY_LIMIT) {
      const batch = pending.slice(i, i + CONCURRENCY_LIMIT)

      await Promise.allSettled(
        batch.map(async (p) => {
          try {
            const adapted = await this.getOrStartAdaptation(p, TIMEOUT_MS)
            if (generation !== this.generation) return
            this.cache.set(p.cacheKey, adapted)
            this.failureCounts.delete(p.cacheKey)
          } catch (err) {
            if (generation !== this.generation) return
            const failures = (this.failureCounts.get(p.cacheKey) ?? 0) + 1
            this.failureCounts.set(p.cacheKey, failures)
            if (process.env.NODE_ENV === 'development') {
              console.warn(
                `[Adaptation] 适配失败 (${failures}/3) [${p.subsystemId}]:`,
                (err as Error)?.message ?? err,
              )
            }
          }
        }),
      )
    }
  }

  // -----------------------------------------------------------------------
  // 内部方法
  // -----------------------------------------------------------------------

  private buildCacheKey(subsystemId: string, rawSummary: string): string {
    const routeSignature = JSON.stringify({
      worldview: simpleHash(this.worldviewText),
      sessionId: this.sessionId ?? '',
      model: this.aiConfig?.model ?? '',
      temperature: this.aiConfig?.temperature ?? null,
      maxTokens: this.aiConfig?.maxTokens ?? null,
      reasoningEffort: this.aiConfig?.reasoningEffort ?? 'disabled',
      providerId: this.aiRouteOptions.providerId ?? '',
      customBaseUrl: this.aiRouteOptions.customBaseUrl ?? '',
      customModel: this.aiRouteOptions.customModel ?? '',
    })
    return `${subsystemId}::${simpleHash(rawSummary)}::${simpleHash(routeSignature)}`
  }

  private getOrStartAdaptation(
    pending: PendingAdaptation,
    timeoutMs: number,
  ): Promise<string> {
    const existing = this.inFlight.get(pending.cacheKey)
    if (existing) return existing

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    })
    const task = Promise.race([this.adaptOne(pending), timeout]).finally(() => {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      if (this.inFlight.get(pending.cacheKey) === task) {
        this.inFlight.delete(pending.cacheKey)
      }
    })
    this.inFlight.set(pending.cacheKey, task)
    return task
  }

  /** 适配单个子系统的 summary */
  private async adaptOne(pending: PendingAdaptation): Promise<string> {
    if (bypassWorldviewAdaptation(pending.subsystemId)) {
      throw new Error(`确定性 Prompt 投影禁止世界观适配: ${pending.subsystemId}`)
    }
    const prompt = ADAPTATION_PROMPT_MAP[pending.subsystemId]
    if (!prompt) throw new Error(`无 adaptation prompt: ${pending.subsystemId}`)
    if (!this.aiConfig) throw new Error('AI 配置未注入')

    const filledUserPrompt = fillAdaptationUserPrompt(
      pending.rawSummary,
      this.worldviewText,
      prompt,
    )

    const rawResult = await callAIWithPromptTemplate(prompt, filledUserPrompt, {
      config: this.aiConfig,
      pool: 'adaptation',
      sessionId: this.sessionId,
      ...this.aiRouteOptions,
    })

    const adapted = extractAdaptedText(rawResult)
    if (!adapted) throw new Error('adaptation 提取为空')
    return adapted
  }

  /** 清空缓存（reset 时调用） */
  clear(): void {
    this.generation++
    this.cache.clear()
    this.failureCounts.clear()
    this.inFlight.clear()
    this.aiConfig = null
    this.aiRouteOptions = {}
    this.sessionId = undefined
    this.worldviewText = ''
  }
}

/** 单例 */
export const adaptationManager = new AdaptationManager()
