import type { NarrativeWordCountTarget, ReasoningEffort } from '@/foundation'

/** 叙事预算校准样本；只保存数值，不保存正文。 */
export interface NarrativeTokenBudgetCalibration {
  envelopeTokens?: number
  reasoningTokens?: number
}

export interface NarrativeTokenBudgetInput {
  targetChineseCharacters: NarrativeWordCountTarget
  reasoningEffort: ReasoningEffort
  calibration?: NarrativeTokenBudgetCalibration
}

export interface NarrativeSettlementTokenBudgetInput {
  narrativeCharacters: number
  activeSubsystemCount: number
  reasoningEffort: ReasoningEffort
}

export interface NarrativeEventRecognitionTokenBudgetInput {
  narrativeCharacters: number
  existingCandidateCount: number
  reasoningEffort: ReasoningEffort
}

function roundUp(value: number, step: number): number {
  return Math.ceil(Math.max(0, value) / step) * step
}

/** 按评估文档计算主叙事 completion budget，最后取整到 64 的倍数。 */
export function computeNarrativeTokenBudget(input: NarrativeTokenBudgetInput): number {
  const storyTokens = Math.ceil(input.targetChineseCharacters * 0.8)
  const envelopeTokens = Math.max(256, Math.round(input.calibration?.envelopeTokens ?? 0))
  const varianceTokens = Math.max(192, Math.ceil(storyTokens * 0.25))
  const reasoningTokens = input.reasoningEffort === 'disabled'
    ? 0
    : Math.max(
      input.reasoningEffort === 'max' ? 4096 : 1024,
      Math.ceil(storyTokens * (input.reasoningEffort === 'max' ? 3 : 1.5)),
      Math.round(input.calibration?.reasoningTokens ?? 0),
    )

  return roundUp(storyTokens + envelopeTokens + varianceTokens + reasoningTokens, 64)
}

/** 结算输出与玩家选择的正文字数档位解耦，按实际正文和可写系统规模留足整包空间。 */
export function computeNarrativeSettlementTokenBudget(
  input: NarrativeSettlementTokenBudgetInput,
): number {
  const narrativeTokens = Math.ceil(Math.max(0, input.narrativeCharacters) * 0.8)
  const operationTokens = Math.max(1, Math.round(input.activeSubsystemCount)) * 320
  const metadataTokens = Math.max(1024, narrativeTokens)
  const reasoningTokens = input.reasoningEffort === 'disabled'
    ? 0
    : Math.max(
      input.reasoningEffort === 'max' ? 4096 : 1024,
      Math.ceil(narrativeTokens * (input.reasoningEffort === 'max' ? 2 : 1)),
    )

  return roundUp(512 + operationTokens + metadataTokens + reasoningTokens, 64)
}

/** 事件识别按实际正文和完整既有候选规模分配独立输出与推理预算。 */
export function computeNarrativeEventRecognitionTokenBudget(
  input: NarrativeEventRecognitionTokenBudgetInput,
): number {
  const narrativeTokens = Math.ceil(Math.max(0, input.narrativeCharacters) * 0.8)
  const existingCandidateTokens = Math.max(0, Math.round(input.existingCandidateCount)) * 128
  const eventTokens = Math.max(768, narrativeTokens)
  const reasoningTokens = input.reasoningEffort === 'disabled'
    ? 0
    : Math.max(
      input.reasoningEffort === 'max' ? 4096 : 1024,
      Math.ceil(narrativeTokens * (input.reasoningEffort === 'max' ? 2 : 1)),
    )

  return roundUp(512 + existingCandidateTokens + eventTokens + reasoningTokens, 64)
}
