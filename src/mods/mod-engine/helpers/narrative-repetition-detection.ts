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

/** 检测连续性回退，并返回最近一条已成立阶段事实的窗口索引。 */
function findStageRegressionReference(newBody: string, recentHistory: string[]): number {
  const recent = recentHistory.slice(-3)
  let departureIndex = -1
  for (let index = recent.length - 1; index >= 0; index--) {
    if (matchesAny(recent[index], DEPARTURE_PATTERNS)) {
      departureIndex = recentHistory.length - recent.length + index
      break
    }
  }
  if (departureIndex < 0 || !matchesAny(newBody, PREPARATION_PATTERNS)) return -1
  if (matchesAny(newBody, CONTINUITY_PATTERNS) || matchesAny(newBody, RETROSPECTIVE_PATTERNS)) {
    return -1
  }
  return departureIndex
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
  const stageRegressionReference = hasTextOverlap
    ? -1
    : findStageRegressionReference(newBody, window)
  const hasStageRegression = stageRegressionReference >= 0
  const isRepetitive = hasTextOverlap || hasStageRegression
  const severity = maxSimilarity >= REPETITION_HIGH_THRESHOLD ? 'high' : 'normal'
  const kind = hasTextOverlap
    ? 'text-overlap'
    : hasStageRegression
      ? 'stage-regression'
      : 'none'

  return {
    isRepetitive,
    maxSimilarity,
    matchedIndex: hasStageRegression ? stageRegressionReference : matchedIndex,
    severity,
    kind,
  }
}

/**
 * 预生成只是尚未提交的候选；消费前必须复用实时路径的重复与阶段连续性门禁。
 * 命中时丢弃缓存并改走实时生成，避免默认预生成把已知重复正文直接交给玩家。
 */
export function inspectPrefetchedNarrativeRepetition(
  narrative: string,
  recentHistory: string[],
): { canConsume: boolean; repetition: RepetitionCheckResult } {
  const repetition = checkNarrativeRepetition(narrative, recentHistory)
  return {
    canConsume: !repetition.isRepetitive,
    repetition,
  }
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
    return `上一版正文与近期历史有 ${percent}% 文本重叠（相似度 ${result.maxSimilarity.toFixed(2)}），属于严重重复。必须重写重复呈现并继续推进，但要保留已经成立的人物、目标、事件结果和因果链；不得靠更换事实来降低相似度。`
  }
  return `上一版正文与近期历史有 ${percent}% 文本重叠（相似度 ${result.maxSimilarity.toFixed(2)}）。请调整叙事角度、动作细节和人物互动方式，避免重复已提交的意象组合，同时保持既有事实和因果连续。`
}
