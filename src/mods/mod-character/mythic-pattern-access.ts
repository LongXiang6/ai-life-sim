/**
 * @module mythic-pattern-access
 * @description 轮回天赋生成与跨局总库的公共入口
 * @mod mod-character
 */

import { scaleTokenBudgetByInputLength, stringifyPrompt } from '@/foundation'

import type {
  MythicPattern,
  MythicPatternCandidate,
  ReincarnationTalentStrengthTier,
} from './types'
import { mythicPatternOutputSchema, mythicPatternPrompt } from './prompts/mythic-pattern-prompt'

export interface GenerateMythicPatternCandidatesInput {
  worldName: string
  worldDescription?: string
  characterName: string
  finalAge?: number
  /** 由结算链提供的整局摘要；本模块不从自由文本自行猜测人生事实。 */
  lifeSummary: string
  /** 按时间顺序提供的关键人生记录或结构化 digest。 */
  lifeRecords: readonly string[]
  /** 结算页白名单化后的最终结构状态，不接收完整 Store 快照。 */
  finalState?: Readonly<Record<string, unknown>>
  /** 压缩系统产出的分段人生摘要。 */
  lifeDigests?: readonly { startRound: number; endRound: number; summary: string }[]
  /** 已有总库词条，用于要求 AI 避免同名/同概念候选。 */
  existingPatterns?: readonly Pick<MythicPattern, 'name' | 'concept' | 'effect'>[]
  /** 本地通用结算评分；AI 不得重算或改写。 */
  endingScore: number
  /** 由评分纯函数确定的轮回天赋强度档位。 */
  strengthTier: {
    id: ReincarnationTalentStrengthTier
    label: string
    guidance: string
  }
}

export type MythicPatternAICaller = (
  systemPrompt: string,
  userPrompt: string,
  options?: unknown,
) => Promise<string>

export interface GenerateMythicPatternCandidatesOptions {
  /** 可逐次注入，也可预先通过 setMythicPatternAIService 配置。 */
  callAI?: MythicPatternAICaller
  signal?: AbortSignal
  maxTokensOverride?: number
  providerId?: string
  apiKey?: string
  customBaseUrl?: string
  customModel?: string
}

let configuredCallAI: MythicPatternAICaller | null = null

export function setMythicPatternAIService(callAI: MythicPatternAICaller): void {
  configuredCallAI = callAI
}

export function buildMythicPatternUserPrompt(input: GenerateMythicPatternCandidatesInput): string {
  return stringifyPrompt({
    worldName: input.worldName || '未知世界',
    worldDescription: input.worldDescription?.trim() || undefined,
    characterName: input.characterName || '无名之辈',
    finalAge: typeof input.finalAge === 'number' ? input.finalAge : undefined,
    lifeSummary: input.lifeSummary,
    finalState: input.finalState,
    lifeDigests: input.lifeDigests,
    lifeRecords: input.lifeRecords,
    endingScore: input.endingScore,
    reincarnationStrengthTier: input.strengthTier,
    existingMythicPatterns: input.existingPatterns?.map((pattern) => ({
      name: pattern.name,
      concept: pattern.concept,
    })),
  })
}

export function estimateMythicPatternTokenBudget(userPromptLength: number): number {
  return scaleTokenBudgetByInputLength(1200, userPromptLength, 12288)
}

function parseJsonResponse(response: string): unknown {
  const trimmed = response.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return JSON.parse(fenced?.[1] ?? trimmed)
}

function normalizeIdentityPart(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, '').toLocaleLowerCase()
}

export async function generateMythicPatternCandidates(
  input: GenerateMythicPatternCandidatesInput,
  options: GenerateMythicPatternCandidatesOptions = {},
): Promise<MythicPatternCandidate[]> {
  const callAI = options.callAI ?? configuredCallAI
  if (!callAI) throw new Error('[mythic-pattern] AI 服务未配置')
  if (!input.lifeSummary.trim() && input.lifeRecords.length === 0) {
    throw new Error('[mythic-pattern] 缺少可用于凝结轮回天赋的人生记录')
  }
  if (!Number.isFinite(input.endingScore) || input.endingScore < 0 || input.endingScore > 100) {
    throw new Error('[mythic-pattern] 人生评分无效')
  }

  const userPrompt = buildMythicPatternUserPrompt(input)
  const response = await callAI(
    mythicPatternPrompt.systemPrompt,
    userPrompt,
    {
      pool: 'lowFrequency',
      jsonMode: true,
      signal: options.signal,
      providerId: options.providerId,
      apiKey: options.apiKey,
      customBaseUrl: options.customBaseUrl,
      customModel: options.customModel,
      maxTokensOverride: options.maxTokensOverride ?? estimateMythicPatternTokenBudget(userPrompt.length),
      outputSchema: mythicPatternPrompt.outputSchema,
      logContext: { callKind: 'mythic-pattern-generate' },
    },
  )
  if (!response?.trim()) throw new Error('[mythic-pattern] AI 返回空结果')

  let parsed: unknown
  try {
    parsed = parseJsonResponse(response)
  } catch (error) {
    throw new Error('[mythic-pattern] AI 返回无法解析为 JSON', { cause: error })
  }
  const result = mythicPatternOutputSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`[mythic-pattern] AI 返回结构无效: ${result.error.issues.map((issue) => issue.message).join('；')}`)
  }

  const names = new Set(result.data.map((candidate) => normalizeIdentityPart(candidate.name)))
  const concepts = new Set(result.data.map((candidate) => normalizeIdentityPart(candidate.concept)))
  if (names.size !== 3 || concepts.size !== 3) {
    throw new Error('[mythic-pattern] AI 返回的三个候选存在同名或同概念重复')
  }
  const existingNames = new Set((input.existingPatterns ?? []).map((pattern) => normalizeIdentityPart(pattern.name)))
  if (result.data.some((candidate) => existingNames.has(normalizeIdentityPart(candidate.name)))) {
    throw new Error('[mythic-pattern] AI 返回了总库中已有的同名词条')
  }
  return result.data.map((candidate) => ({
    ...candidate,
    strengthTier: input.strengthTier.id,
    sourceScore: Math.round(input.endingScore),
  }))
}

export { mythicPatternCandidateSchema, mythicPatternOutputSchema, mythicPatternPrompt } from './prompts/mythic-pattern-prompt'
export { sealMythicPatternCandidate, useMythicLibraryStore } from './mythic-library-store'
