import { z } from 'zod'

import { callAI, parseAIJSON } from '@/core'
import { DEFAULT_AI_MODEL } from '@/core/ai-service'
import type { AIModelConfig } from '@/foundation'
import { useSettingsStore } from '@/mods/mod-settings'

import type { GameOverAchievement } from './game-over-scoring'

const EndingReviewResponseSchema = z.object({
  perspective: z.enum(['micro', 'macro']),
  review: z.string().trim().min(1),
  evidenceIds: z.array(z.string().min(1)),
}).strict()

export interface EndingReview {
  perspective: 'micro' | 'macro'
  review: string
  evidenceIds: string[]
  source: 'ai' | 'local'
}

export interface EndingReviewInput {
  lifeRunId: string
  round: number
  characterName: string
  worldName: string
  finalAge: number
  died: boolean
  score: number
  dimensions: readonly {
    id: string
    label: string
    value: number
    comment: string
  }[]
  achievements: readonly GameOverAchievement[]
}

export function buildLocalEndingReview(input: EndingReviewInput): EndingReview {
  const highest = input.dimensions.reduce<(typeof input.dimensions)[number] | null>((best, current) => (
    !best || current.value > best.value ? current : best
  ), null)
  const featured = input.achievements.reduce<GameOverAchievement | null>((best, current) => (
    !best || current.weight > best.weight ? current : best
  ), null)
  const perspective = input.achievements.filter((item) => item.kind === 'choice').length
    >= input.achievements.filter((item) => item.kind === 'breakthrough').length
    ? 'micro' as const
    : 'macro' as const
  const achievementText = featured
    ? `你在${featured.timeLabel}${featured.detail}，这次行动成为此生最清晰的转折。`
    : `你走完了 ${input.round} 轮人生，并让每一步都成为可以复核的经历。`
  const dimensionText = highest
    ? `你在“${highest.label}”上留下了最强的证据，这份积累把这一生推到了 ${input.score} 分。`
    : `你以 ${input.score} 分完成了这段人生。`
  return {
    perspective,
    review: `${achievementText}${dimensionText}`,
    evidenceIds: featured ? [featured.id] : [],
    source: 'local',
  }
}

export async function generateEndingReview(input: EndingReviewInput): Promise<EndingReview> {
  const fallback = buildLocalEndingReview(input)
  const settings = useSettingsStore.getState()
  const model = settings.customModel || DEFAULT_AI_MODEL
  const config: AIModelConfig = {
    model,
    temperature: 0.45,
    maxTokens: 900,
    responseFormat: { type: 'json_object' },
    reasoningEffort: 'disabled',
    stream: false,
  }
  const allowedEvidenceIds = new Set(input.achievements.map((item) => item.id))
  try {
    const raw = await callAI([
      '你只解释已经由本地算法固定的人生结算，不修改分数，不新增事实。',
      'review 全文使用第二人称“你”，先肯定有证据的选择或成果，再说明它如何塑造这一生，最后按分数收束。',
      '个人选择更强时 perspective=\"micro\"；时代或广域影响更强时 perspective=\"macro\"。',
      'evidenceIds 只能引用输入中存在的证据编号。返回单个 JSON 对象，不输出 Markdown。',
    ].join('\n'), JSON.stringify({
      fixedScore: input.score,
      ending: { finalAge: input.finalAge, died: input.died },
      worldName: input.worldName,
      characterName: input.characterName,
      dimensions: input.dimensions,
      achievements: input.achievements.map(({ id, kind, title, detail, timeLabel }) => ({
        id,
        kind,
        title,
        detail,
        timeLabel,
      })),
    }), {
      apiKey: settings.customKey || undefined,
      config,
      pool: 'lowFrequency',
      sessionId: `ending-${input.lifeRunId}`,
      jsonMode: true,
      strictSchema: true,
      outputSchema: EndingReviewResponseSchema,
      providerId: settings.provider,
      customBaseUrl: settings.customUrl || undefined,
      customModel: model,
      reasoningEffort: 'disabled',
      overrideMaxTokens: config.maxTokens,
      logContext: {
        lifeRunId: input.lifeRunId,
        round: input.round,
        callKind: 'ending-review',
        pool: 'lowFrequency',
        model,
      },
    })
    const parsedJson = parseAIJSON<unknown>(raw)
    if (!parsedJson) return fallback
    const parsed = EndingReviewResponseSchema.parse(parsedJson)
    if (parsed.evidenceIds.some((id) => !allowedEvidenceIds.has(id))) return fallback
    return { ...parsed, source: 'ai' }
  } catch {
    return fallback
  }
}
