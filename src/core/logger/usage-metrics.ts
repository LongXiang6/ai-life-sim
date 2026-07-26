/**
 * @module usage-metrics.ts
 * @description 叙事生成质量指标，不记录用户界面操作。
 */

export interface StoryRepetitionUsageMetric {
  schemaVersion: 2
  kind: 'story_repetition'
  /** 局次是浏览器生成的不透明 ID，不关联账号或诊断码。 */
  lifeRunId: string
  round: number
  windowSize: number
  wordRepeatRate: number
  maxRecentWordOverlap: number
  maxRecentNgramSimilarity: number
  qualityLevel: 'normal' | 'watch' | 'high'
}

/** 同一局同一轮的重复率上报是可覆盖观测，聚合端按此键取最后一次。 */
export function storyRepetitionUsageMetricKey(metric: StoryRepetitionUsageMetric): string {
  return `${metric.lifeRunId}:${metric.round}`
}

/** 用纯数字字段判断同一轮的最终观测是否已经上报，不保留任何正文。 */
export function storyRepetitionUsageMetricRevision(metric: StoryRepetitionUsageMetric): string {
  return [
    metric.windowSize,
    metric.wordRepeatRate,
    metric.maxRecentWordOverlap,
    metric.maxRecentNgramSimilarity,
    metric.qualityLevel,
  ].join(':')
}
