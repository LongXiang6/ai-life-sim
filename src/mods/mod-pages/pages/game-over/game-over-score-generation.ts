/**
 * Purpose: Generate the world-adapted five-dimension score for one completed life.
 * Owner: core:scoring
 * Responsibility: AI request and fixed scoring Prompt only; arithmetic and verification remain in core scoring.
 */

import {
  callAI,
  createLifeScoringResult,
  LifeScoringAIResponseSchema,
  parseAIJSON,
} from '@/core'
import { DEFAULT_AI_MODEL } from '@/core/ai-service'
import type {
  AIModelConfig,
  LifeScoringAuditSnapshot,
  LifeScoringEvidence,
  LifeScoringResult,
} from '@/foundation'
import { stringifyPrompt } from '@/foundation'
import { useSettingsStore } from '@/mods/mod-settings'

export interface GameOverScoreGenerationInput {
  lifeRunId: string
  round: number
  characterName: string
  worldName: string
  finalAge: number
  died: boolean
  evidence: readonly LifeScoringEvidence[]
  audit: LifeScoringAuditSnapshot
}

export const LIFE_SCORING_PROMPT_VERSION = '2.1.0'

export const LIFE_SCORING_SYSTEM_PROMPT = stringifyPrompt({
  role: '世界适配人生评分专员',
  responsibility: '只建立正好五个适配当前世界与本段人生的评价维度，并为每个维度评分。',
  dimensionSelection: [
    '五个维度共同覆盖这段人生最重要的力量、选择、代价、关系与回响。',
    '每个维度使用独立观察角度，并由输入中已经发生的人生事实支撑。',
    '维度名称与衡量含义使用当前世界能够自然理解的语言和尺度。',
  ],
  fieldResponsibilities: {
    id: '只负责稳定、简短的机器标识。',
    label: '只负责界面展示的维度名称。',
    description: '只负责说明该维度在当前世界中衡量什么。',
    value: '只负责 0-100 整数评分，由证据分量、持续性、完成程度和实际影响共同形成。',
    comment: '只负责用第二人称与具体事实说明本维度判断。',
    evidenceIds: '只负责引用真正承担本维度判断的输入证据编号。',
  },
  output: '纯 JSON 对象，根字段为 dimensions，数组正好包含五个对象。系统取五个维度分值的算术平均值作为最终总分。',
})

export async function generateLifeScore(
  input: GameOverScoreGenerationInput,
): Promise<LifeScoringResult> {
  const settings = useSettingsStore.getState()
  const model = settings.customModel || DEFAULT_AI_MODEL
  const config: AIModelConfig = {
    model,
    temperature: 0.35,
    responseFormat: { type: 'json_object' },
    reasoningEffort: 'disabled',
    stream: false,
  }
  const raw = await callAI(LIFE_SCORING_SYSTEM_PROMPT, JSON.stringify({
    settlement: {
      characterName: input.characterName,
      worldName: input.worldName,
      finalAge: input.finalAge,
      died: input.died,
      rounds: input.round,
    },
    evidence: input.evidence,
  }), {
    apiKey: settings.customKey || undefined,
    config,
    pool: 'lowFrequency',
    sessionId: `life-score-${input.lifeRunId}`,
    jsonMode: true,
    outputSchema: LifeScoringAIResponseSchema,
    providerId: settings.provider,
    customBaseUrl: settings.customUrl || undefined,
    customModel: model,
    reasoningEffort: 'disabled',
    logContext: {
      lifeRunId: input.lifeRunId,
      round: input.round,
      callKind: 'life-settlement-score',
      pool: 'lowFrequency',
      model,
      promptVersion: LIFE_SCORING_PROMPT_VERSION,
    },
  })
  const parsed = parseAIJSON<unknown>(raw)
  if (!parsed) throw new Error('五维人生评分返回内容不是有效 JSON')
  return createLifeScoringResult({
    response: parsed,
    allowedEvidenceIds: input.evidence.map((item) => item.id),
    audit: input.audit,
  })
}
