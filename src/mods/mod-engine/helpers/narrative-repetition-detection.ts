/**
 * @module narrative-repetition-detection.ts
 * @description 叙事重复检测 —— 基于字符 n-gram Jaccard 相似度
 * @mod mod-engine
 *
 * 检测新叙事与最近历史的文本重复；相似度过高时触发重试。
 * 只用于质量门禁，不修改持久化历史。
 */

const SHINGLE_SIZE = 5
const REPETITION_THRESHOLD = 0.7
const REPETITION_HIGH_THRESHOLD = 0.85
const RECENT_WINDOW = 6

const DEPARTURE_PATTERNS = [
  /正式(?:出发|启程)/u,
  /踏上(?:了)?(?:征途|旅程)/u,
  /启程(?:前往|奔赴)/u,
  /队伍(?:终于|已经|随即)?出发/u,
  /离开(?:了)?(?:公会|基地|营地|港口)/u,
]
const PREPARATION_PATTERNS = [
  /整装待发/u,
  /准备(?:再次|重新)?(?:出发|启程)/u,
  /(?:出发|启程)前/u,
  /训练场/u,
  /制定(?:远征|行动|出发)计划/u,
  /打点行装/u,
]
const CONTINUITY_PATTERNS = [
  /返回|归来|撤退|返航|折返|失败|中断|取消|暂缓|休整|补给|重新整编/u,
]
const RETROSPECTIVE_PATTERNS = [
  /回忆|想起|忆起|曾经|当年|那时/u,
]

/** 提取文本中的字符 n-gram 集合 */
function collectShingles(text: string, size: number): Set<string> {
  const normalized = text.replace(/\s+/gu, '')
  const shingles = new Set<string>()
  for (let i = 0; i <= normalized.length - size; i++) {
    shingles.add(normalized.slice(i, i + size))
  }
  return shingles
}

/** 计算两个集合的 Jaccard 相似度 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  const smaller = a.size < b.size ? a : b
  const larger = a.size < b.size ? b : a
  for (const item of smaller) {
    if (larger.has(item)) intersection++
  }
  return intersection / (a.size + b.size - intersection)
}

export interface RepetitionCheckResult {
  isRepetitive: boolean
  maxSimilarity: number
  matchedIndex: number
  severity: 'normal' | 'high'
  kind: 'none' | 'text-overlap' | 'stage-regression'
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

/** 检测已经启程后无返回/中断因果又回到出发准备阶段的连续性回退。 */
function hasUnexplainedStageRegression(newBody: string, recentHistory: string[]): boolean {
  const recent = recentHistory.slice(-3)
  const departed = recent.some((text) => matchesAny(text, DEPARTURE_PATTERNS))
  if (!departed || !matchesAny(newBody, PREPARATION_PATTERNS)) return false
  return !matchesAny(newBody, CONTINUITY_PATTERNS)
    && !matchesAny(newBody, RETROSPECTIVE_PATTERNS)
}

/**
 * 检查新叙事正文是否与最近历史高度重复。
 * @param newBody 新叙事正文（已提取，不含协议标记）
 * @param recentHistory 最近 N 条历史叙事文本
 * @returns 重复检测结果
 */
export function checkNarrativeRepetition(
  newBody: string,
  recentHistory: string[],
): RepetitionCheckResult {
  if (!newBody.trim() || recentHistory.length === 0) {
    return { isRepetitive: false, maxSimilarity: 0, matchedIndex: -1, severity: 'normal', kind: 'none' }
  }

  const newShingles = collectShingles(newBody, SHINGLE_SIZE)
  if (newShingles.size === 0) {
    return { isRepetitive: false, maxSimilarity: 0, matchedIndex: -1, severity: 'normal', kind: 'none' }
  }

  let maxSimilarity = 0
  let matchedIndex = -1

  const window = recentHistory.slice(-RECENT_WINDOW)
  for (let i = 0; i < window.length; i++) {
    const historyShingles = collectShingles(window[i], SHINGLE_SIZE)
    const similarity = jaccardSimilarity(newShingles, historyShingles)
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity
      matchedIndex = i
    }
  }

  const hasTextOverlap = maxSimilarity >= REPETITION_THRESHOLD
  const hasStageRegression = !hasTextOverlap
    && hasUnexplainedStageRegression(newBody, window)
  const isRepetitive = hasTextOverlap || hasStageRegression
  const severity = maxSimilarity >= REPETITION_HIGH_THRESHOLD ? 'high' : 'normal'
  const kind = hasTextOverlap
    ? 'text-overlap'
    : hasStageRegression
      ? 'stage-regression'
      : 'none'

  return { isRepetitive, maxSimilarity, matchedIndex, severity, kind }
}

export interface RepetitionRepairDecision {
  accepted: boolean
  content: string
  reason: 'accepted' | 'invalid-protocol' | 'still-repetitive'
  repetition: RepetitionCheckResult | null
}

/** 只有协议有效且不再重复的候选才能替换上一版完整输出。 */
export function chooseNarrativeRepetitionRepair(params: {
  previousContent: string
  candidateContent: string
  candidateBody: string | null
  candidateProtocolValid: boolean
  recentHistory: string[]
}): RepetitionRepairDecision {
  if (!params.candidateProtocolValid || !params.candidateBody?.trim()) {
    return {
      accepted: false,
      content: params.previousContent,
      reason: 'invalid-protocol',
      repetition: null,
    }
  }

  const repetition = checkNarrativeRepetition(params.candidateBody, params.recentHistory)
  if (repetition.isRepetitive) {
    return {
      accepted: false,
      content: params.previousContent,
      reason: 'still-repetitive',
      repetition,
    }
  }

  return {
    accepted: true,
    content: params.candidateContent,
    reason: 'accepted',
    repetition,
  }
}

/**
 * 构建重复修正提示（用于重试时追加到 user 消息）
 */
export function buildRepetitionRepairInstruction(result: RepetitionCheckResult): string {
  if (result.kind === 'stage-regression') {
    return '上一版在队伍已经启程后，又无返回、失败或中断因果地回到了训练/出发准备阶段。必须承接已完成的启程状态，推进目的地事件、关系或目标；若确实返回，需明确写出可验证的返回因果。'
  }
  const percent = Math.round(result.maxSimilarity * 100)
  if (result.severity === 'high') {
    return `上一版正文与近期历史有 ${percent}% 文本重叠（相似度 ${result.maxSimilarity.toFixed(2)}），属于严重重复。必须完全重写：更换场景、人物、事件和因果链，保留世界观但不得复用近期已出现的具体意象、组合或句式。`
  }
  return `上一版正文与近期历史有 ${percent}% 文本重叠（相似度 ${result.maxSimilarity.toFixed(2)}）。请调整叙事角度、更换场景细节和人物互动，避免重复已提交的意象组合。`
}
