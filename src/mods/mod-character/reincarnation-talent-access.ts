/**
 * Purpose: Expose the settlement promotion entry for ordinary patterns and reincarnation talents.
 * Owner: mod-character
 * Responsibility: Build the promotion AI request and construct persisted talents; callers supply inputs and consume results.
 */

import type {
  AttributeModifiers,
  DestinyPatternCategory,
  DestinyPatternAptitudeTier,
  DestinyPatternDevelopmentStage,
  ReincarnationTalent,
  ReincarnationTalentSource,
} from './types'
import { DESTINY_PATTERN_APTITUDE_ORDER } from './constants'
import { validateDestinyPatternAttrBonusForAptitude } from './destiny-pattern-growth'
import {
  reincarnationPromotionOutputSchema,
  reincarnationPromotionPrompt,
} from './prompts/reincarnation-promotion-prompt'

/** 待升阶词条的统一投影；普通命格与已入库轮回天赋都可进入同一结算选择。 */
export interface ReincarnationPromotionSource {
  lineageId: string
  version: number
  name: string
  description: string
  effect: string
  category: DestinyPatternCategory
  aptitudeTier: DestinyPatternAptitudeTier
  developmentStage: DestinyPatternDevelopmentStage
  attrBonus: Partial<AttributeModifiers>
  /** 普通命格为 0；已入库轮回天赋为其当前强化等级。 */
  apexStrengthenLevel: number
}

export interface ReincarnationPromotionInput {
  worldName: string
  worldDescription?: string
  characterName: string
  finalAge?: number
  /** 由结算链提供的整局摘要；本模块不从自由文本自行猜测人生事实。 */
  lifeSummary: string
  /** 按时间顺序提供的关键人生记录或结构化 digest。 */
  lifeRecords: readonly string[]
  /** 压缩系统产出的分段人生摘要。 */
  lifeDigests?: readonly { sourceRound: number; summary: string }[]
  /** 玩家在四个携带槽中选定的待升阶词条。 */
  selectedPattern: ReincarnationPromotionSource
  /** 本地通用结算评分；AI 不得重算或改写。 */
  endingScore: number
  /** 由评分纯函数确定的轮回强度档位。 */
  strengthTier: {
    id: string
    label: string
    guidance: string
  }
  /** 程序已经决定的唯一升阶结果；AI 只负责描述。 */
  promotionDecision: ReincarnationPromotionDecision
}

export interface ReincarnationPromotionResult {
  name: string
  description: string
  effect: string
  attrBonus: Partial<AttributeModifiers>
}

export type ReincarnationMutationSeverity =
  | '无异变'
  | '轻微异变'
  | '局部异变'
  | '明显异变'
  | '重大异变'
  | '彻底重组'

export interface ReincarnationPromotionDecision {
  success: boolean
  sourceAptitudeTier: DestinyPatternAptitudeTier
  targetAptitudeTier: DestinyPatternAptitudeTier
  currentApexStrengthenLevel: number
  attemptedApexStrengthenLevel: number
  resultingApexStrengthenLevel: number
  failureRate: number
  mutationSeverity: ReincarnationMutationSeverity
  attributeCap: number
}

function mutationSeverity(failureRate: number): ReincarnationMutationSeverity {
  if (failureRate >= 50) return '彻底重组'
  if (failureRate >= 40) return '重大异变'
  if (failureRate >= 30) return '明显异变'
  if (failureRate >= 20) return '局部异变'
  if (failureRate >= 10) return '轻微异变'
  return '无异变'
}

export type ReincarnationPromotionAICaller = (
  systemPrompt: string,
  userPrompt: string,
  options?: unknown,
) => Promise<string>

export interface ReincarnationPromotionOptions {
  /** 可逐次注入，也可预先通过 setReincarnationPromotionAIService 配置。 */
  callAI?: ReincarnationPromotionAICaller
  signal?: AbortSignal
  providerId?: string
  apiKey?: string
  customBaseUrl?: string
  customModel?: string
}

let configuredCallAI: ReincarnationPromotionAICaller | null = null

export function setReincarnationPromotionAIService(callAI: ReincarnationPromotionAICaller): void {
  configuredCallAI = callAI
}

/** 九阶资质都可结算；至高保持资质并继续强化。 */
export function isPromotableReincarnationSource(source: ReincarnationPromotionSource): boolean {
  return DESTINY_PATTERN_APTITUDE_ORDER.includes(source.aptitudeTier)
}

export function getReincarnationPromotionTargetAptitudeTier(
  sourceAptitudeTier: DestinyPatternAptitudeTier,
): DestinyPatternAptitudeTier {
  const sourceIndex = DESTINY_PATTERN_APTITUDE_ORDER.indexOf(sourceAptitudeTier)
  if (sourceIndex < 0) throw new Error('[reincarnation-promotion] 待升阶词条等级无效')
  return DESTINY_PATTERN_APTITUDE_ORDER[
    Math.min(sourceIndex + 1, DESTINY_PATTERN_APTITUDE_ORDER.length - 1)
  ]!
}

/** 程序唯一拥有至高强化成败；注入 random 便于确定性测试。 */
export function decideReincarnationPromotion(
  source: ReincarnationPromotionSource,
  random: () => number = Math.random,
): ReincarnationPromotionDecision {
  const targetAptitudeTier = getReincarnationPromotionTargetAptitudeTier(source.aptitudeTier)
  if (source.aptitudeTier !== 9) {
    return {
      success: true,
      sourceAptitudeTier: source.aptitudeTier,
      targetAptitudeTier,
      currentApexStrengthenLevel: source.apexStrengthenLevel,
      attemptedApexStrengthenLevel: 0,
      resultingApexStrengthenLevel: 0,
      failureRate: 0,
      mutationSeverity: '无异变',
      attributeCap: targetAptitudeTier * 2,
    }
  }

  const currentApexStrengthenLevel = Math.max(0, Math.trunc(source.apexStrengthenLevel))
  const attemptedApexStrengthenLevel = currentApexStrengthenLevel + 1
  const failureRate = attemptedApexStrengthenLevel >= 6
    ? Math.min(50, (attemptedApexStrengthenLevel - 5) * 10)
    : 0
  const sample = random()
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new Error('[reincarnation-promotion] 随机源必须返回大于等于0且小于1的有限数')
  }
  const success = failureRate === 0 || sample >= failureRate / 100
  const resultingApexStrengthenLevel = success
    ? attemptedApexStrengthenLevel
    : Math.max(0, currentApexStrengthenLevel - 1)
  return {
    success,
    sourceAptitudeTier: source.aptitudeTier,
    targetAptitudeTier,
    currentApexStrengthenLevel,
    attemptedApexStrengthenLevel,
    resultingApexStrengthenLevel,
    failureRate,
    mutationSeverity: success ? '无异变' : mutationSeverity(failureRate),
    attributeCap: 18,
  }
}

export function buildReincarnationPromotionUserPrompt(input: ReincarnationPromotionInput): string {
  return JSON.stringify({
    worldName: input.worldName || '未知世界',
    worldDescription: input.worldDescription?.trim() || undefined,
    characterName: input.characterName || '无名之辈',
    finalAge: typeof input.finalAge === 'number' ? input.finalAge : undefined,
    lifeSummary: input.lifeSummary,
    lifeDigests: input.lifeDigests,
    lifeRecords: input.lifeRecords,
    endingScore: input.endingScore,
    reincarnationStrengthTier: input.strengthTier,
    selectedPattern: {
      name: input.selectedPattern.name,
      description: input.selectedPattern.description,
      effect: input.selectedPattern.effect,
      aptitudeTier: input.selectedPattern.aptitudeTier,
      developmentStage: input.selectedPattern.developmentStage,
      targetAptitudeTier: getReincarnationPromotionTargetAptitudeTier(input.selectedPattern.aptitudeTier),
      category: input.selectedPattern.category,
      apexStrengthenLevel: input.selectedPattern.apexStrengthenLevel,
      attrBonus: input.selectedPattern.attrBonus,
    },
    promotionDecision: input.promotionDecision,
  })
}

function parseJsonResponse(response: string): unknown {
  const trimmed = response.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return JSON.parse(fenced?.[1] ?? trimmed)
}

export async function promoteReincarnationTalent(
  input: ReincarnationPromotionInput,
  options: ReincarnationPromotionOptions = {},
): Promise<ReincarnationPromotionResult> {
  const callAI = options.callAI ?? configuredCallAI
  if (!callAI) throw new Error('[reincarnation-promotion] AI 服务未配置')
  if (!isPromotableReincarnationSource(input.selectedPattern)) {
    throw new Error('[reincarnation-promotion] 待升阶词条等级无效')
  }
  if (!input.lifeSummary.trim() && input.lifeRecords.length === 0) {
    throw new Error('[reincarnation-promotion] 缺少可用于强化轮回天赋的人生记录')
  }
  if (!Number.isFinite(input.endingScore) || input.endingScore < 0 || input.endingScore > 100) {
    throw new Error('[reincarnation-promotion] 人生评分无效')
  }

  const userPrompt = buildReincarnationPromotionUserPrompt(input)
  const response = await callAI(
    reincarnationPromotionPrompt.systemPrompt,
    userPrompt,
    {
      pool: 'lowFrequency',
      jsonMode: true,
      signal: options.signal,
      providerId: options.providerId,
      apiKey: options.apiKey,
      customBaseUrl: options.customBaseUrl,
      customModel: options.customModel,
      outputSchema: reincarnationPromotionPrompt.outputSchema,
      logContext: { callKind: 'reincarnation-promotion' },
    },
  )
  if (!response?.trim()) throw new Error('[reincarnation-promotion] AI 返回空结果')

  let parsed: unknown
  try {
    parsed = parseJsonResponse(response)
  } catch (error) {
    throw new Error('[reincarnation-promotion] AI 返回无法解析为 JSON', { cause: error })
  }
  const result = reincarnationPromotionOutputSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`[reincarnation-promotion] AI 返回结构无效: ${result.error.issues.map((issue) => issue.message).join('；')}`)
  }
  if (!validateDestinyPatternAttrBonusForAptitude(result.data.attrBonus, input.promotionDecision.targetAptitudeTier)) {
    throw new Error('[reincarnation-promotion] 属性加成超过目标资质边界或包含无效值')
  }
  return result.data
}

/** 由升阶 AI 内容与来源词条构造可入库的轮回天赋；等级只由本地顺序决定。 */
export function createPromotedReincarnationTalent(
  source: ReincarnationPromotionSource,
  promoted: ReincarnationPromotionResult,
  decision: ReincarnationPromotionDecision,
  sourceMeta: ReincarnationTalentSource,
  acquiredAt = Date.now(),
): ReincarnationTalent {
  const targetAptitudeTier = getReincarnationPromotionTargetAptitudeTier(source.aptitudeTier)
  if (decision.sourceAptitudeTier !== source.aptitudeTier || decision.targetAptitudeTier !== targetAptitudeTier) {
    throw new Error('[reincarnation-promotion] 强化决定与来源词条不一致')
  }
  if (!validateDestinyPatternAttrBonusForAptitude(promoted.attrBonus, targetAptitudeTier)) {
    throw new Error('[reincarnation-promotion] 属性加成超过目标资质边界或包含无效值')
  }
  return {
    id: `${source.lineageId}:v${source.version + 1}`,
    lineageId: source.lineageId,
    version: source.version + 1,
    name: promoted.name,
    description: promoted.description,
    category: source.category,
    aptitudeTier: targetAptitudeTier,
    developmentStage: 'awakening',
    effect: promoted.effect,
    attrBonus: { ...promoted.attrBonus },
    apexStrengthenLevel: decision.resultingApexStrengthenLevel,
    acquiredAt,
    source: {
      worldName: sourceMeta.worldName.trim() || '未知世界',
      characterName: sourceMeta.characterName.trim() || '无名之辈',
      ...(typeof sourceMeta.finalAge === 'number' && Number.isFinite(sourceMeta.finalAge)
        ? { finalAge: sourceMeta.finalAge }
        : {}),
      ...(typeof sourceMeta.runId === 'string' && sourceMeta.runId.trim()
        ? { runId: sourceMeta.runId.trim() }
        : {}),
    },
  }
}

export { reincarnationPromotionSchema, reincarnationPromotionOutputSchema, reincarnationPromotionPrompt } from './prompts/reincarnation-promotion-prompt'
