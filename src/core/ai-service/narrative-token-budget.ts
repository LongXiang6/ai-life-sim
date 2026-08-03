import type { NarrativeWordCountTarget, ReasoningEffort } from '@/foundation'

/** 叙事预算校准样本；只保存数值，不保存正文。 */
export interface NarrativeTokenBudgetCalibration {
  envelopeTokens?: number
  reasoningTokens?: number
}

export interface NarrativeTokenBudgetInput {
  targetChineseCharacters: NarrativeWordCountTarget
  maximumChineseCharacters?: number
  reasoningEffort: ReasoningEffort
  calibration?: NarrativeTokenBudgetCalibration
}

export interface NarrativeDataAnalysisTokenBudgetInput {
  narrativeCharacters: number
  activeSubsystemCount: number
  reasoningEffort: ReasoningEffort
}

export interface NarrativeBasicAttributeTokenBudgetInput {
  reasoningEffort: ReasoningEffort
}

export interface NarrativeEventRecognitionTokenBudgetInput {
  narrativeCharacters: number
  existingCandidateCount: number
  reasoningEffort: ReasoningEffort
}

export interface NarrativeMacroImpactTokenBudgetInput {
  narrativeCharacters: number
  activeSubsystemCount: number
  reasoningEffort: ReasoningEffort
}

function roundUp(value: number, step: number): number {
  return Math.ceil(Math.max(0, value) / step) * step
}

/** 按评估文档计算主叙事 completion budget，最后取整到 64 的倍数。 */
export function computeNarrativeTokenBudget(input: NarrativeTokenBudgetInput): number {
  const plannedCharacters = Math.max(
    input.targetChineseCharacters,
    Math.round(input.maximumChineseCharacters ?? input.targetChineseCharacters),
  )
  const storyTokens = Math.ceil(plannedCharacters * 0.8)
  const envelopeTokens = Math.max(256, Math.round(input.calibration?.envelopeTokens ?? 0))
  const branchAndVarianceTokens = Math.max(192, Math.ceil(storyTokens * 0.25))
  const reasoningTokens = input.reasoningEffort === 'disabled'
    ? 0
    : Math.max(
      input.reasoningEffort === 'max' ? 4096 : 1024,
      Math.ceil(storyTokens * (input.reasoningEffort === 'max' ? 3 : 1.5)),
      Math.round(input.calibration?.reasoningTokens ?? 0),
    )

  return roundUp(storyTokens + envelopeTokens + branchAndVarianceTokens + reasoningTokens, 64)
}

/** 数据分析只预算非基础属性系统操作，不再承担事件元数据。 */
export function computeNarrativeDataAnalysisTokenBudget(
  input: NarrativeDataAnalysisTokenBudgetInput,
): number {
  const narrativeTokens = Math.ceil(Math.max(0, input.narrativeCharacters) * 0.8)
  const operationTokens = Math.max(1, Math.round(input.activeSubsystemCount)) * 320
  const evidenceTokens = Math.max(512, Math.ceil(narrativeTokens * 0.5))
  const reasoningTokens = input.reasoningEffort === 'disabled'
    ? 0
    : Math.max(
      input.reasoningEffort === 'max' ? 4096 : 1024,
      Math.ceil(narrativeTokens * (input.reasoningEffort === 'max' ? 2 : 1)),
    )

  return roundUp(384 + operationTokens + evidenceTokens + reasoningTokens, 64)
}

/** 基础属性最多返回一条四字段增量操作，输出空间与正文档位解耦。 */
export function computeNarrativeBasicAttributeTokenBudget(
  input: NarrativeBasicAttributeTokenBudgetInput,
): number {
  const reasoningTokens = input.reasoningEffort === 'disabled'
    ? 0
    : input.reasoningEffort === 'max'
      ? 4096
      : 1024
  return roundUp(1024 + reasoningTokens, 64)
}

/** 事件识别按实际正文和完整既有候选规模分配独立输出与推理预算。 */
export function computeNarrativeEventRecognitionTokenBudget(
  input: NarrativeEventRecognitionTokenBudgetInput,
): number {
  const narrativeTokens = Math.ceil(Math.max(0, input.narrativeCharacters) * 0.8)
  const existingCandidateTokens = Math.max(0, Math.round(input.existingCandidateCount)) * 128
  const eventTokens = Math.max(1536, narrativeTokens)
  const reasoningTokens = input.reasoningEffort === 'disabled'
    ? 0
    : Math.max(
      input.reasoningEffort === 'max' ? 4096 : 1024,
      Math.ceil(narrativeTokens * (input.reasoningEffort === 'max' ? 2 : 1)),
    )

  return roundUp(512 + existingCandidateTokens + eventTokens + reasoningTokens, 64)
}

/** 宏观影响按活动系统数量和故事长度预算 DAG 节点，不占用主叙事输出空间。 */
export function computeNarrativeMacroImpactTokenBudget(
  input: NarrativeMacroImpactTokenBudgetInput,
): number {
  const narrativeTokens = Math.ceil(Math.max(0, input.narrativeCharacters) * 0.8)
  const systemTokens = Math.max(1, Math.round(input.activeSubsystemCount)) * 256
  const reasoningTokens = input.reasoningEffort === 'disabled'
    ? 0
    : Math.max(
      input.reasoningEffort === 'max' ? 4096 : 1024,
      Math.ceil(narrativeTokens * (input.reasoningEffort === 'max' ? 2 : 1)),
    )
  return roundUp(768 + narrativeTokens + systemTokens + reasoningTokens, 64)
}
