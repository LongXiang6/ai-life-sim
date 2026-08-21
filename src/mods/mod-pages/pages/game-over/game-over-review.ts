/**
 * Purpose: Generate the single authoritative ending review and four-line verse.
 * Owner: mod-pages/game-over
 * Responsibility: Ending-review Prompt, response schema, evidence validation, and AI request only.
 */

import { z } from 'zod'

import { callAI, parseAIJSON } from '@/core'
import { DEFAULT_AI_MODEL } from '@/core/ai-service'
import { stringifyPrompt, type AIModelConfig } from '@/foundation'
import { useSettingsStore } from '@/mods/mod-settings'

const EndingReviewResponseSchema = z.object({
  perspective: z.enum(['micro', 'macro']),
  review: z.string().trim().min(1),
  verse: z.string().trim().min(1),
  evidenceIds: z.array(z.string().min(1)),
}).strict()

export interface EndingReview {
  perspective: 'micro' | 'macro'
  review: string
  verse: string
  evidenceIds: string[]
  source: 'ai'
}

export interface EndingReviewEvidence {
  id: string
  kind: 'world-fact' | 'character-state' | 'narrative' | 'life-digest' | 'achievement' | 'dimension'
  content: string
  timeLabel?: string
}

export interface EndingReviewInput {
  lifeRunId: string
  round: number
  characterName: string
  worldName: string
  finalAge: number
  died: boolean
  evidence: readonly EndingReviewEvidence[]
}

export const ENDING_REVIEW_PROMPT_VERSION = '2.1.0'

export const ENDING_REVIEW_SYSTEM_PROMPT = stringifyPrompt({
  role: '深谙古典诗词与人物传记的人生终章写作者',
  responsibility: '只为一段已经结束的人生写一则克制、准确的终章评语和一首七言四句诗。',
  sourceSelection: [
    '通读输入证据，从中选择两三处最有分量的经历、物件、行动、关系或结果。',
    '评语与诗句中的事件、物件、场景和人物回应都由输入证据承载。',
    '整篇使用一个贯穿视角，让少量事实彼此照应并自然收束。',
  ],
  fieldResponsibilities: {
    perspective: '只判断个人选择更强的 micro，或时代与广域影响更强的 macro。',
    review: [
      '使用第二人称，以 90-150 字平静回望这一生。',
      '让具体场景、动作、物件和人物回应连接因果与回声，使画面承担判断。',
      '结构随贯穿视角自然展开，可以顺时间、从一段往事回望，或从一个真实物件进入。',
      '正文只承载经历与判断，评分和轮数继续由结算页面展示。',
    ],
    verse: [
      '另写四行，每行七个汉字，沿用评语中的真实意象与人物回声。',
      '四行末字依次使用平、平、仄、平声；第一、二、四行同韵或近韵。',
      '其余格律由自然声口、真实意象和末行收束共同决定。',
    ],
    evidenceIds: '只引用实际承担评语与诗句取材的输入证据编号。',
  },
  output: '纯 JSON 对象，只含 perspective、review、verse、evidenceIds。',
})

export async function generateEndingReview(input: EndingReviewInput): Promise<EndingReview> {
  const settings = useSettingsStore.getState()
  const model = settings.customModel || DEFAULT_AI_MODEL
  const config: AIModelConfig = {
    model,
    temperature: 0.45,
    responseFormat: { type: 'json_object' },
    reasoningEffort: 'disabled',
    stream: false,
  }
  const allowedEvidenceIds = new Set(input.evidence.map((item) => item.id))
  const raw = await callAI(ENDING_REVIEW_SYSTEM_PROMPT, JSON.stringify({
    character: {
      name: input.characterName,
      worldName: input.worldName,
      finalAge: input.finalAge,
      died: input.died,
    },
    evidence: input.evidence,
  }), {
    apiKey: settings.customKey || undefined,
    config,
    pool: 'lowFrequency',
    sessionId: `ending-${input.lifeRunId}`,
    jsonMode: true,
    outputSchema: EndingReviewResponseSchema,
    providerId: settings.provider,
    customBaseUrl: settings.customUrl || undefined,
    customModel: model,
    reasoningEffort: 'disabled',
    logContext: {
      lifeRunId: input.lifeRunId,
      round: input.round,
      callKind: 'ending-review',
      pool: 'lowFrequency',
      model,
      promptVersion: ENDING_REVIEW_PROMPT_VERSION,
    },
  })
  const parsedJson = parseAIJSON<unknown>(raw)
  if (!parsedJson) throw new Error('结算评语返回内容不是有效 JSON')
  const parsed = EndingReviewResponseSchema.parse(parsedJson)
  const unknownEvidenceIds = parsed.evidenceIds.filter((id) => !allowedEvidenceIds.has(id))
  if (unknownEvidenceIds.length > 0) {
    throw new Error(`结算评语引用了未知证据：${unknownEvidenceIds.join('、')}`)
  }
  return { ...parsed, source: 'ai' }
}
