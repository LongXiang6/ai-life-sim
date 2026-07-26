import type { ReasoningEffort } from '@/foundation'

/** 叙事预算校准样本；只保存数值，不保存正文。 */
export interface NarrativeTokenBudgetCalibration {
  envelopeTokens?: number
  reasoningTokens?: number
}

export interface NarrativeTokenBudgetInput {
  targetChineseCharacters: number
  reasoningEffort: ReasoningEffort
  calibration?: NarrativeTokenBudgetCalibration
}

function roundUp(value: number, step: number): number {
  return Math.ceil(Math.max(0, value) / step) * step
}

/** 按评估文档计算主叙事 completion budget，最后取整到 64 的倍数。 */
export function computeNarrativeTokenBudget(input: NarrativeTokenBudgetInput): number {
  const target = Number.isFinite(input.targetChineseCharacters)
    ? Math.max(50, Math.round(input.targetChineseCharacters))
    : 200
  const storyTokens = Math.ceil(target * 0.6)
  const envelopeTokens = Math.max(0, Math.round(input.calibration?.envelopeTokens ?? 768))
  const varianceTokens = Math.max(256, Math.ceil(storyTokens * 0.25))
  const reasoningTokens = input.reasoningEffort === 'disabled'
    ? 0
    : Math.max(
      input.reasoningEffort === 'max' ? 4096 : 1024,
      Math.ceil(storyTokens * (input.reasoningEffort === 'max' ? 3 : 1.5)),
      Math.round(input.calibration?.reasoningTokens ?? 0),
    )

  return roundUp(storyTokens + envelopeTokens + varianceTokens + reasoningTokens, 64)
}
