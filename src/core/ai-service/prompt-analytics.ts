/**
 * @module prompt-analytics.ts
 * @description 提示词性能监控 — Token 计数、层分析和 KV Cache 命中率估算
 * @mod core
 *
 * 提供提示词性能分析和优化建议，帮助监控和优化 Token 使用。
 */

import type { PromptSegments } from './prompt-builder'

/** Token 计数结果 */
export interface TokenCounts {
  total: number
  system: number
  segments: number[]
}

/** 层分析结果 */
export interface LayerBreakdown {
  systemPrompt: number
  globalInfo: number
  memory: number
  roundGuidance: number
  changeRequirements: number
}

/** KV Cache 估算 */
export interface KVCacheEstimate {
  stablePrefixTokens: number
  variableSuffixTokens: number
  estimatedHitRate: number
}

/** 完整性能指标 */
export interface PromptMetrics {
  totalTokens: number
  layerBreakdown: LayerBreakdown
  kvCacheEstimate: KVCacheEstimate
  optimizationOpportunities: string[]
  timestamp: number
}

/** 性能记录 */
export interface PerformanceRecord {
  id: string
  timestamp: number
  metrics: PromptMetrics
  context: {
    campaignId?: string
    worldType?: string
    roundNumber?: number
  }
}

/**
 * 简单的 Token 估算器
 * 基于字符数和语言特征估算 Token 数量
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0

  // 中文字符约 1.5-2 Token
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  // 英文单词约 1 Token
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  // 数字约 0.5 Token
  const numbers = (text.match(/\d+/g) || []).length
  // 标点和特殊字符约 0.5 Token
  const punctuation = (text.match(/[^\w\s\u4e00-\u9fff]/g) || []).length

  return Math.ceil(
    chineseChars * 1.5 +
    englishWords * 1 +
    numbers * 0.5 +
    punctuation * 0.5
  )
}

/**
 * 计算提示词分段的 Token 数量
 */
export function countSegmentTokens(segments: PromptSegments): TokenCounts {
  const segmentTokens: number[] = []

  if (segments.userSegments) {
    for (const segment of segments.userSegments) {
      segmentTokens.push(estimateTokenCount(segment))
    }
  } else if (segments.full) {
    segmentTokens.push(estimateTokenCount(segments.full))
  }

  const total = segmentTokens.reduce((sum, count) => sum + count, 0)

  return {
    total,
    system: 0, // 系统提示词单独计算
    segments: segmentTokens,
  }
}

/**
 * 计算层分析
 */
export function calculateLayerBreakdown(
  segments: PromptSegments,
  tokenCounts: TokenCounts,
): LayerBreakdown {
  const seg0 = tokenCounts.segments[0] || 0
  const seg1 = tokenCounts.segments[1] || 0
  const seg2 = tokenCounts.segments[2] || 0
  const seg3 = tokenCounts.segments[3] || 0

  return {
    systemPrompt: tokenCounts.system,
    globalInfo: seg0,
    memory: seg1,
    roundGuidance: seg2,
    changeRequirements: seg3,
  }
}

/**
 * 估算 KV Cache 命中率
 */
export function estimateKVCachePerformance(
  segments: PromptSegments,
  tokenCounts: TokenCounts,
): KVCacheEstimate {
  const stablePrefix = segments.stablePrefixChars
  const totalChars = segments.full.length
  const stableRatio = totalChars > 0 ? stablePrefix / totalChars : 0

  const stablePrefixTokens = Math.round(tokenCounts.total * stableRatio)
  const variableSuffixTokens = tokenCounts.total - stablePrefixTokens

  // 估算命中率：稳定前缀占比越高，命中率越高
  // S4 策略（四条消息）通常有更好的缓存效果
  let estimatedHitRate = stableRatio
  if (segments.strategy === 'S4') {
    estimatedHitRate = Math.min(0.95, stableRatio * 1.2)
  } else if (segments.strategy === 'S3') {
    estimatedHitRate = Math.min(0.9, stableRatio * 1.1)
  }

  return {
    stablePrefixTokens,
    variableSuffixTokens,
    estimatedHitRate,
  }
}

/**
 * 识别优化机会
 */
export function identifyOptimizations(
  layerBreakdown: LayerBreakdown,
  kvEstimate: KVCacheEstimate,
  context?: { worldType?: string },
): string[] {
  const opportunities: string[] = []

  // 检查总 Token 数
  const totalTokens = layerBreakdown.systemPrompt +
    layerBreakdown.globalInfo +
    layerBreakdown.memory +
    layerBreakdown.roundGuidance +
    layerBreakdown.changeRequirements

  if (totalTokens > 4000) {
    opportunities.push('总 Token 数超过 4000，考虑精简提示词内容')
  }

  // 检查各层占比
  if (layerBreakdown.memory > totalTokens * 0.4) {
    opportunities.push('记忆层占比过高，考虑压缩或摘要记忆内容')
  }

  if (layerBreakdown.roundGuidance > totalTokens * 0.3) {
    opportunities.push('本轮引导层占比过高，考虑精简引导内容')
  }

  // 检查 KV Cache 命中率
  if (kvEstimate.estimatedHitRate < 0.7) {
    opportunities.push('KV Cache 命中率较低，考虑调整分段策略')
  }

  // 检查稳定前缀
  if (kvEstimate.stablePrefixTokens < 100) {
    opportunities.push('稳定前缀过短，考虑增加全局常驻内容')
  }

  return opportunities
}

/**
 * 性能监控器
 */
export class PromptPerformanceMonitor {
  private records: PerformanceRecord[] = []
  private maxRecords: number

  constructor(maxRecords: number = 1000) {
    this.maxRecords = maxRecords
  }

  /**
   * 分析提示词性能
   */
  async analyzePrompt(
    segments: PromptSegments,
    context?: {
      campaignId?: string
      worldType?: string
      roundNumber?: number
      systemPrompt?: string
    },
  ): Promise<PromptMetrics> {
    const tokenCounts = countSegmentTokens(segments)

    // 如果有系统提示词，计算其 Token 数
    if (context?.systemPrompt) {
      tokenCounts.system = estimateTokenCount(context.systemPrompt)
      tokenCounts.total += tokenCounts.system
    }

    const layerBreakdown = calculateLayerBreakdown(segments, tokenCounts)
    const kvEstimate = estimateKVCachePerformance(segments, tokenCounts)
    const optimizationOpportunities = identifyOptimizations(
      layerBreakdown,
      kvEstimate,
      { worldType: context?.worldType },
    )

    const metrics: PromptMetrics = {
      totalTokens: tokenCounts.total,
      layerBreakdown,
      kvCacheEstimate: kvEstimate,
      optimizationOpportunities,
      timestamp: Date.now(),
    }

    // 记录性能数据
    this.recordMetrics(metrics, context)

    return metrics
  }

  /**
   * 记录性能指标
   */
  private recordMetrics(
    metrics: PromptMetrics,
    context?: {
      campaignId?: string
      worldType?: string
      roundNumber?: number
    },
  ): void {
    const record: PerformanceRecord = {
      id: this.generateId(),
      timestamp: metrics.timestamp,
      metrics,
      context: context || {},
    }

    this.records.push(record)

    // 保持记录数量在限制内
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords)
    }
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats(timeRangeMs: number = 24 * 60 * 60 * 1000): {
    totalRecords: number
    averageTokens: number
    maxTokens: number
    minTokens: number
    averageHitRate: number
    commonOptimizations: Array<{ optimization: string; count: number }>
  } {
    const cutoff = Date.now() - timeRangeMs
    const recentRecords = this.records.filter(r => r.timestamp >= cutoff)

    if (recentRecords.length === 0) {
      return {
        totalRecords: 0,
        averageTokens: 0,
        maxTokens: 0,
        minTokens: 0,
        averageHitRate: 0,
        commonOptimizations: [],
      }
    }

    const tokenValues = recentRecords.map(r => r.metrics.totalTokens)
    const hitRates = recentRecords.map(r => r.metrics.kvCacheEstimate.estimatedHitRate)

    // 统计常见优化机会
    const optimizationCounts = new Map<string, number>()
    for (const record of recentRecords) {
      for (const opt of record.metrics.optimizationOpportunities) {
        optimizationCounts.set(opt, (optimizationCounts.get(opt) || 0) + 1)
      }
    }

    const commonOptimizations = Array.from(optimizationCounts.entries())
      .map(([optimization, count]) => ({ optimization, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      totalRecords: recentRecords.length,
      averageTokens: tokenValues.reduce((a, b) => a + b, 0) / recentRecords.length,
      maxTokens: Math.max(...tokenValues),
      minTokens: Math.min(...tokenValues),
      averageHitRate: hitRates.reduce((a, b) => a + b, 0) / recentRecords.length,
      commonOptimizations,
    }
  }

  /**
   * 获取 Token 使用趋势
   */
  getTokenUsageTrend(days: number = 7): Array<{
    date: string
    averageTokens: number
    maxTokens: number
    recordCount: number
  }> {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const trend: Array<{
      date: string
      averageTokens: number
      maxTokens: number
      recordCount: number
    }> = []

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * dayMs
      const dayEnd = now - i * dayMs
      const dayRecords = this.records.filter(
        r => r.timestamp >= dayStart && r.timestamp < dayEnd,
      )

      const date = new Date(dayStart).toISOString().split('T')[0]
      const tokenValues = dayRecords.map(r => r.metrics.totalTokens)

      trend.push({
        date,
        averageTokens: tokenValues.length > 0
          ? tokenValues.reduce((a, b) => a + b, 0) / tokenValues.length
          : 0,
        maxTokens: tokenValues.length > 0 ? Math.max(...tokenValues) : 0,
        recordCount: dayRecords.length,
      })
    }

    return trend
  }

  /**
   * 获取 KV Cache 命中率趋势
   */
  getCacheHitRateTrend(days: number = 7): Array<{
    date: string
    averageHitRate: number
    recordCount: number
  }> {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const trend: Array<{
      date: string
      averageHitRate: number
      recordCount: number
    }> = []

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * dayMs
      const dayEnd = now - i * dayMs
      const dayRecords = this.records.filter(
        r => r.timestamp >= dayStart && r.timestamp < dayEnd,
      )

      const date = new Date(dayStart).toISOString().split('T')[0]
      const hitRates = dayRecords.map(r => r.metrics.kvCacheEstimate.estimatedHitRate)

      trend.push({
        date,
        averageHitRate: hitRates.length > 0
          ? hitRates.reduce((a, b) => a + b, 0) / hitRates.length
          : 0,
        recordCount: dayRecords.length,
      })
    }

    return trend
  }

  /**
   * 清除所有记录
   */
  clear(): void {
    this.records = []
  }

  /**
   * 获取记录数量
   */
  getRecordCount(): number {
    return this.records.length
  }

  private generateId(): string {
    return `perf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }
}

/**
 * 全局性能监控实例
 */
export const globalPromptPerformanceMonitor = new PromptPerformanceMonitor()

/**
 * 便捷函数：分析提示词性能
 */
export async function analyzePromptPerformance(
  segments: PromptSegments,
  context?: {
    campaignId?: string
    worldType?: string
    roundNumber?: number
    systemPrompt?: string
  },
): Promise<PromptMetrics> {
  return globalPromptPerformanceMonitor.analyzePrompt(segments, context)
}

/**
 * 便捷函数：获取性能统计
 */
export function getPromptPerformanceStats(timeRangeMs?: number) {
  return globalPromptPerformanceMonitor.getPerformanceStats(timeRangeMs)
}

/**
 * 便捷函数：获取 Token 使用趋势
 */
export function getTokenUsageTrend(days?: number) {
  return globalPromptPerformanceMonitor.getTokenUsageTrend(days)
}

/**
 * 便捷函数：获取 KV Cache 命中率趋势
 */
export function getCacheHitRateTrend(days?: number) {
  return globalPromptPerformanceMonitor.getCacheHitRateTrend(days)
}
