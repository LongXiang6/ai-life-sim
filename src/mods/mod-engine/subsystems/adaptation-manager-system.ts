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

import { callAIWithPromptTemplate } from '@/core'

import { ADAPTATION_PROMPT_MAP } from '../helpers/adaptation-prompt-registry.generated'

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 待适配的子系统摘要 */
interface PendingAdaptation {
  subsystemId: string
  rawSummary: string
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
      return parsed.narrativeHints[0]
    }
    if (typeof parsed.name === 'string' && typeof parsed.description === 'string') {
      return `${parsed.name}：${parsed.description}`
    }
    if (typeof parsed.realmName === 'string' && parsed.realmName) {
      const hints = Array.isArray(parsed.narrativeHints) ? parsed.narrativeHints.join('；') : ''
      return `${parsed.realmName}${hints ? '——' + hints : ''}`
    }
    // 兜底：取第一个字符串字段
    for (const v of Object.values(parsed)) {
      if (typeof v === 'string' && v) return v
    }
  } catch {
    // JSON parse failed → 返回 raw content 的前 200 字
  }
  return content.slice(0, 200) || undefined
}

// ---------------------------------------------------------------------------
// AdaptationManager
// ---------------------------------------------------------------------------

export class AdaptationManager {
  /** 缓存：key = subsystemId::hash(rawSummary) → adaptedText */
  private cache = new Map<string, string>()

  /** 失败计数：key = subsystemId → 连续失败次数（3 次后永久跳过） */
  private failureCounts = new Map<string, number>()

  /** AI 配置（由 orchestrator 每轮注入） */
  private aiConfig: AIModelConfig | null = null
  private sessionId: string | undefined

  /** 世界观适配文本（用于填充 prompt 变量） */
  private worldviewText = ''

  // -----------------------------------------------------------------------
  // 公共方法
  // -----------------------------------------------------------------------

  /** 设置 AI 配置（每轮开始前由 orchestrator 注入） */
  setAiConfig(config: AIModelConfig, sessionId?: string): void {
    this.aiConfig = config
    this.sessionId = sessionId
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
      const cacheKey = s.id + '::' + simpleHash(s.summary)

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
      const cacheKey = s.id + '::' + simpleHash(s.summary)
      if (this.cache.has(cacheKey)) continue // 已缓存

      const prompt = ADAPTATION_PROMPT_MAP[s.id]
      if (!prompt) continue // 无对应 adaptation prompt

      const failures = this.failureCounts.get(s.id) ?? 0
      if (failures >= 3) continue // 永久跳过

      pending.push({ subsystemId: s.id, rawSummary: s.summary })
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

    // 限制并发：最多 3 个同时
    const CONCURRENCY_LIMIT = 3
    const TIMEOUT_MS = 8_000

    for (let i = 0; i < pending.length; i += CONCURRENCY_LIMIT) {
      const batch = pending.slice(i, i + CONCURRENCY_LIMIT)

      await Promise.allSettled(
        batch.map((p) =>
          this.adaptOne(p)
            .then(
              (adapted) => {
                const key = p.subsystemId + '::' + simpleHash(p.rawSummary)
                this.cache.set(key, adapted)
                // 成功后重置失败计数
                this.failureCounts.delete(p.subsystemId)
              },
              (err) => {
                const failures = (this.failureCounts.get(p.subsystemId) ?? 0) + 1
                this.failureCounts.set(p.subsystemId, failures)
                if (process.env.NODE_ENV === 'development') {
                  console.warn(
                    `[Adaptation] 适配失败 (${failures}/3) [${p.subsystemId}]:`,
                    (err as Error)?.message ?? err,
                  )
                }
              },
            )
            // 超时兜底：8 秒后放弃
            .then((result) => {
              const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS),
              )
              return Promise.race([result, timeout])
            }),
        ),
      )
    }
  }

  // -----------------------------------------------------------------------
  // 内部方法
  // -----------------------------------------------------------------------

  /** 适配单个子系统的 summary */
  private async adaptOne(pending: PendingAdaptation): Promise<string> {
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
    })

    const adapted = extractAdaptedText(rawResult)
    if (!adapted) throw new Error('adaptation 提取为空')
    return adapted
  }

  /** 清空缓存（reset 时调用） */
  clear(): void {
    this.cache.clear()
    this.failureCounts.clear()
    this.aiConfig = null
    this.sessionId = undefined
    this.worldviewText = ''
  }
}

/** 单例 */
export const adaptationManager = new AdaptationManager()
