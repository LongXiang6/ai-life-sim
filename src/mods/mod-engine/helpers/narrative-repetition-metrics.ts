/**
 * 叙事重复率指标。
 *
 * 这是质量观测，不是剧情裁剪器：正文和历史始终由 mod-engine 保持完整。
 * 中文优先使用 Intl.Segmenter，缺失时退回可审计的正则分词。
 */

export type NarrativeRepetitionQuality = 'normal' | 'watch' | 'high'

export interface NarrativeRepetitionMetric {
  round: number
  comparedRounds: number[]
  significantTokenCount: number
  repeatedTokenCount: number
  wordRepeatRate: number
  maxRecentWordOverlap: number
  averageRecentWordOverlap: number
  maxRecentNgramSimilarity: number
  qualityLevel: NarrativeRepetitionQuality
  matchedRound?: number
}

export interface NarrativeRepetitionSummary {
  rounds: number
  measuredRounds: number
  averageWordRepeatRate: number
  recentAverageWordRepeatRate: number
  maxWordRepeatRate: number
  maxRecentNgramSimilarity: number
  highRepeatRounds: number
  trend: 'rising' | 'falling' | 'stable'
  peakRound?: number
}

interface NarrativeHistoryMetricCarrier {
  repetitionMetric?: unknown
}

/** 每局只用于把同一浏览器局次的数字指标归并，不关联账号或诊断编号。 */
export function createNarrativeLifeRunId(): string {
  return `life-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const STOP_WORDS = new Set([
  '然后', '于是', '但是', '因为', '所以', '如果', '可以', '自己', '这个', '那个', '一个',
  '没有', '不是', '还是', '以及', '并且', '开始', '继续', '进行', '之后', '现在', '时候',
  '起来', '一下', '什么', '怎么', '已经', '可能', '希望', '想要', '他们', '我们', '你们',
])

function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[⟦⟧]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function normalizeToken(token: string): string | null {
  const value = token.normalize('NFKC').toLocaleLowerCase('zh-CN').trim()
  if (!value || STOP_WORDS.has(value)) return null
  if (/^\d+$/u.test(value) || /https?:|www\.|@/u.test(value)) return null
  if (!/[\p{Script=Han}\p{L}]/u.test(value)) return null
  if (/^[\p{P}\p{S}]+$/u.test(value)) return null
  return value
}

export function tokenizeNarrative(text: string): string[] {
  const source = normalizeText(text)
  if (!source) return []
  let segments: string[] = []
  try {
    const Segmenter = (Intl as typeof Intl & {
      Segmenter?: new (locales?: string | string[], options?: { granularity: 'word' }) => {
        segment(value: string): Iterable<{ segment: string; isWordLike?: boolean }>
      }
    }).Segmenter
    if (Segmenter) {
      const segmenter = new Segmenter('zh-CN', { granularity: 'word' })
      segments = [...segmenter.segment(source)]
        .filter((part) => part.isWordLike !== false)
        .map((part) => part.segment)
    }
  } catch {
    segments = []
  }
  if (segments.length === 0) {
    segments = source.match(/[\p{Script=Han}]{2,}|[A-Za-z][A-Za-z0-9_]{1,}|\d+/gu) ?? []
  }
  return segments.map(normalizeToken).filter((token): token is string => Boolean(token))
}

function unique<T>(values: readonly T[]): Set<T> {
  return new Set(values)
}

function jaccard<T>(left: Set<T>, right: Set<T>): number {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  for (const item of left) if (right.has(item)) intersection += 1
  return intersection / (left.size + right.size - intersection)
}

function ngramSet(text: string, size = 5): Set<string> {
  const source = normalizeText(text).replace(/\s+/gu, '')
  const result = new Set<string>()
  for (let index = 0; index <= source.length - size; index += 1) {
    result.add(source.slice(index, index + size))
  }
  return result
}

function clampRate(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function isRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

/** 持久化恢复只接受完整数字指标；畸形客户端对象不能污染聚合状态。 */
export function isNarrativeRepetitionMetric(value: unknown): value is NarrativeRepetitionMetric {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const metric = value as Partial<NarrativeRepetitionMetric>
  const round = metric.round
  if (typeof round !== 'number' || !Number.isInteger(round) || round < 1) return false
  if (!Array.isArray(metric.comparedRounds)
    || metric.comparedRounds.length > 5
    || new Set(metric.comparedRounds).size !== metric.comparedRounds.length
    || metric.comparedRounds.some((comparedRound) => (
      !Number.isInteger(comparedRound) || comparedRound < 1 || comparedRound >= round
    ))) return false
  if (!Number.isInteger(metric.significantTokenCount) || (metric.significantTokenCount ?? -1) < 0) return false
  if (!Number.isInteger(metric.repeatedTokenCount)
    || (metric.repeatedTokenCount ?? -1) < 0
    || (metric.repeatedTokenCount ?? 0) > (metric.significantTokenCount ?? 0)) return false
  if (!isRate(metric.wordRepeatRate)
    || !isRate(metric.maxRecentWordOverlap)
    || !isRate(metric.averageRecentWordOverlap)
    || !isRate(metric.maxRecentNgramSimilarity)) return false
  if (metric.qualityLevel !== 'normal' && metric.qualityLevel !== 'watch' && metric.qualityLevel !== 'high') {
    return false
  }
  return metric.matchedRound === undefined
    || (Number.isInteger(metric.matchedRound)
      && metric.matchedRound >= 1
      && metric.matchedRound < round
      && metric.comparedRounds.includes(metric.matchedRound))
}

export function collectNarrativeRepetitionMetrics(
  history: readonly NarrativeHistoryMetricCarrier[],
): NarrativeRepetitionMetric[] {
  return history
    .map((entry) => entry.repetitionMetric)
    .filter(isNarrativeRepetitionMetric)
    .map((metric) => structuredClone(metric))
}

export function calculateNarrativeRepetitionMetric(params: {
  round: number
  text: string
  recentHistory: readonly { round: number; text: string }[]
  windowSize?: number
}): NarrativeRepetitionMetric {
  const currentTokens = tokenizeNarrative(params.text)
  const currentSet = unique(currentTokens)
  const history = params.recentHistory.slice(-(params.windowSize ?? 5))
  const comparisons = history.map((entry) => ({
    round: entry.round,
    tokens: unique(tokenizeNarrative(entry.text)),
    ngrams: ngramSet(entry.text),
  }))
  const overlaps = comparisons.map((entry) => jaccard(currentSet, entry.tokens))
  const maxOverlap = overlaps.length ? Math.max(...overlaps) : 0
  const maxWordOverlapIndex = overlaps.findIndex((value) => value === maxOverlap)
  const closestWordVocabulary = maxWordOverlapIndex >= 0
    ? comparisons[maxWordOverlapIndex].tokens
    : undefined
  const repeatedTokenCount = currentTokens.filter((token) =>
    closestWordVocabulary?.has(token) === true,
  ).length
  const wordRepeatRate = currentTokens.length ? clampRate(repeatedTokenCount / currentTokens.length) : 0
  const currentNgrams = ngramSet(params.text)
  const ngramSimilarities = comparisons.map((entry) => jaccard(currentNgrams, entry.ngrams))
  const maxRecentNgramSimilarity = ngramSimilarities.length ? Math.max(...ngramSimilarities) : 0
  const averageRecentWordOverlap = overlaps.length
    ? clampRate(overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length)
    : 0
  const maxNgramIndex = ngramSimilarities.findIndex((value) => value === maxRecentNgramSimilarity)
  const matchedIndex = maxRecentNgramSimilarity > maxOverlap
    ? maxNgramIndex
    : maxWordOverlapIndex
  const qualityLevel: NarrativeRepetitionQuality = maxRecentNgramSimilarity >= 0.65 || maxOverlap >= 0.75
    ? 'high'
    : maxRecentNgramSimilarity >= 0.35 || maxOverlap >= 0.55
      ? 'watch'
      : 'normal'
  return {
    round: params.round,
    comparedRounds: comparisons.map((entry) => entry.round),
    significantTokenCount: currentTokens.length,
    repeatedTokenCount,
    wordRepeatRate: Number(wordRepeatRate.toFixed(4)),
    maxRecentWordOverlap: Number(clampRate(maxOverlap).toFixed(4)),
    averageRecentWordOverlap: Number(averageRecentWordOverlap.toFixed(4)),
    maxRecentNgramSimilarity: Number(clampRate(maxRecentNgramSimilarity).toFixed(4)),
    qualityLevel,
    ...(matchedIndex >= 0 ? { matchedRound: comparisons[matchedIndex].round } : {}),
  }
}

export function summarizeNarrativeRepetitionMetrics(
  metrics: readonly NarrativeRepetitionMetric[],
  recentWindow = 5,
): NarrativeRepetitionSummary {
  // 首轮没有比较对象，只计入总轮数，不参与均值、峰值或趋势。
  const measured = metrics.filter((metric) =>
    metric.significantTokenCount > 0 && metric.comparedRounds.length > 0)
  const latest = measured.slice(-recentWindow)
  const average = (values: readonly number[]) => values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))
    : 0
  const maxMetric = measured.reduce<NarrativeRepetitionMetric | undefined>(
    (best, metric) => !best || metric.wordRepeatRate > best.wordRepeatRate ? metric : best,
    undefined,
  )
  const split = measured.slice(-Math.min(6, measured.length))
  const midpoint = Math.floor(split.length / 2)
  const first = average(split.slice(0, midpoint).map((metric) => metric.wordRepeatRate))
  const second = average(split.slice(midpoint).map((metric) => metric.wordRepeatRate))
  const trend = split.length < 2
    ? 'stable'
    : second - first > 0.08
      ? 'rising'
      : first - second > 0.08
        ? 'falling'
        : 'stable'
  return {
    rounds: metrics.length,
    measuredRounds: measured.length,
    averageWordRepeatRate: average(measured.map((metric) => metric.wordRepeatRate)),
    recentAverageWordRepeatRate: average(latest.map((metric) => metric.wordRepeatRate)),
    maxWordRepeatRate: maxMetric?.wordRepeatRate ?? 0,
    maxRecentNgramSimilarity: measured.length
      ? Number(Math.max(...measured.map((metric) => metric.maxRecentNgramSimilarity)).toFixed(4))
      : 0,
    highRepeatRounds: measured.filter((metric) => metric.qualityLevel === 'high').length,
    trend,
    ...(maxMetric ? { peakRound: maxMetric.round } : {}),
  }
}

export function summarizeNarrativeHistoryRepetition(
  history: readonly NarrativeHistoryMetricCarrier[],
  recentWindow = 5,
): NarrativeRepetitionSummary {
  return summarizeNarrativeRepetitionMetrics(
    collectNarrativeRepetitionMetrics(history),
    recentWindow,
  )
}
