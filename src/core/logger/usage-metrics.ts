/**
 * @module usage-metrics.ts
 * @description 只上传可聚合的使用指标，不上传自定义分支原文。
 */

const USAGE_STOP_WORDS = new Set([
  '然后', '于是', '但是', '因为', '所以', '如果', '可以', '自己', '这个', '那个',
  '一个', '没有', '不是', '还是', '以及', '并且', '开始', '继续', '进行', '之后',
  '现在', '时候', '起来', '一下', '什么', '怎么', '已经', '可能', '希望', '想要',
])

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

export type AggregateUsageMetric =
  | { schemaVersion: 1; kind: 'page_view'; page: string }
  | { schemaVersion: 1; kind: 'narrative_advance'; timeStepKey: string }
  | { schemaVersion: 1; kind: 'time_step_selected'; timeStepKey: string }
  | {
      schemaVersion: 1
      kind: 'branch_choice'
      branchChoiceType: 'custom' | 'preset'
      branchTerms?: string[]
      branchChars?: number
    }
  | StoryRepetitionUsageMetric

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

function normalizeTerm(term: string): string | null {
  const normalized = term.normalize('NFKC').toLocaleLowerCase('zh-CN').trim()
  if (normalized.length < 2 || normalized.length > 16) return null
  if (USAGE_STOP_WORDS.has(normalized)) return null
  if (/^\d+$/u.test(normalized) || /https?:|www\.|@/u.test(normalized)) return null
  if (!/[\p{L}\p{Script=Han}]/u.test(normalized)) return null
  if (/[\p{S}\p{P}\p{Extended_Pictographic}]/u.test(normalized)) return null
  return normalized
}

/** 以每次分支一次计数的方式提取有限词项，避免一条输入放大统计结果。 */
export function extractAggregateTerms(input: string, limit = 12): string[] {
  const source = input.normalize('NFKC').replace(/\b(?:\d{5,}|qq|token|key|secret|password)\b/giu, ' ')
  const terms: string[] = []
  const seen = new Set<string>()
  let segments: string[] = []
  try {
    const Segmenter = (Intl as typeof Intl & {
      Segmenter?: new (locales?: string | string[], options?: { granularity: 'word' }) => {
        segment(value: string): Iterable<{ segment: string; isWordLike?: boolean }>
      }
    }).Segmenter
    if (Segmenter) {
      const segmenter = new Segmenter('zh-CN', { granularity: 'word' })
      segments = [...segmenter.segment(source)].filter((part) => part.isWordLike !== false).map((part) => part.segment)
    }
  } catch {
    segments = []
  }
  if (segments.length === 0) segments = source.split(/[\s,，。！？；：:、/\\()[\]{}<>"'“”‘’]+/u)
  for (const segment of segments) {
    const term = normalizeTerm(segment)
    if (!term || seen.has(term)) continue
    seen.add(term)
    terms.push(term)
    if (terms.length >= limit) break
  }
  return terms
}
