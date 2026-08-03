import type {
  HistoricalEventCandidateAudit,
  HistoricalEventCandidateInput,
  NarrativeWordCountTarget,
  SubSystemChanges,
} from '@/foundation'

import { resolveNarrativeWordCountRange } from '../constants/narrative-config'
import {
  buildNarrativeAIProtocolRepairReminder,
  buildNarrativeEventCandidateFingerprint,
  parseNarrativeAIJson,
  toNarrativeAIIntentId,
  translateNarrativeAIBasicAttributeAnalysis,
  translateNarrativeAIDataAnalysis,
  translateNarrativeAIEventRecognition,
} from './narrative-ai-protocol'
import type { NarrativeRoundMetadata } from './narrative-semantic-signals'
import {
  narrativeParser,
  type ParsedNarrative,
  validateNarrativeEventMetadataForNarrative,
} from '../subsystems/narrative-parser-system'
import {
  translateNarrativeMacroImpact,
  type NarrativeMacroImpactNode,
  type NarrativeMacroSubsystemId,
} from './narrative-macro-impact-context'

export interface NarrativeResponseQuality {
  valid: boolean
  reason: string
  parsed?: ParsedNarrative
  narrativeChars: number
  paragraphCount: number
  lengthAdvisory?: string
}

export interface NarrativeSystemAnalysisQuality {
  valid: boolean
  reason: string
  changes?: SubSystemChanges[]
}

export interface NarrativeEventRecognitionQuality {
  valid: boolean
  reason: string
  metadata?: NarrativeRoundMetadata
  candidates?: HistoricalEventCandidateInput[]
}

export interface NarrativeMacroImpactQuality {
  valid: boolean
  reason: string
  nodes?: NarrativeMacroImpactNode[]
  changes?: SubSystemChanges[]
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** 第一次调用只检查正文及可选玩家分支，不读取任何机器分析字段。 */
export function inspectNarrativeResponseQuality(
  content: string,
  wordCountTarget: NarrativeWordCountTarget,
): NarrativeResponseQuality {
  try {
    const parsed = narrativeParser.parse(content)
    const narrativeChars = parsed.narrative.replace(/\s/gu, '').length
    const paragraphCount = parsed.narrative.split(/\n\s*\n/u).filter(Boolean).length
    const { target, preferredMin, preferredMax } = resolveNarrativeWordCountRange(wordCountTarget)
    const lengthAdvisory = narrativeChars < preferredMin || narrativeChars > preferredMax
      ? `正文约 ${narrativeChars} 字，玩家偏好约 ${target} 字（参考区间 ${preferredMin}-${preferredMax} 字）；完整剧情优先，不因字数偏离重写。`
      : undefined

    return {
      valid: true,
      reason: '',
      parsed,
      narrativeChars,
      paragraphCount,
      ...(lengthAdvisory ? { lengthAdvisory } : {}),
    }
  } catch (error) {
    return {
      valid: false,
      reason: errorMessage(error),
      narrativeChars: 0,
      paragraphCount: 0,
    }
  }
}

export function inspectNarrativeDataAnalysisQuality(input: {
  content: string
  allowedEvidenceEventIds: readonly string[]
  allowedSubsystemIds: readonly string[]
}): NarrativeSystemAnalysisQuality {
  try {
    return {
      valid: true,
      reason: '',
      changes: translateNarrativeAIDataAnalysis(parseNarrativeAIJson(input.content), {
        allowedEvidenceEventIds: input.allowedEvidenceEventIds,
        allowedSubsystemIds: input.allowedSubsystemIds,
      }),
    }
  } catch (error) {
    return { valid: false, reason: errorMessage(error) }
  }
}

export function inspectNarrativeBasicAttributeAnalysisQuality(input: {
  content: string
  allowedEvidenceEventIds: readonly string[]
  allowedSubsystemIds: readonly string[]
}): NarrativeSystemAnalysisQuality {
  try {
    return {
      valid: true,
      reason: '',
      changes: translateNarrativeAIBasicAttributeAnalysis(parseNarrativeAIJson(input.content), {
        allowedEvidenceEventIds: input.allowedEvidenceEventIds,
        allowedSubsystemIds: input.allowedSubsystemIds,
      }),
    }
  } catch (error) {
    return { valid: false, reason: errorMessage(error) }
  }
}

export function inspectNarrativeMacroImpactQuality(input: {
  content: string
  activeSubsystemIds: readonly NarrativeMacroSubsystemId[]
  allowedEvidenceEventIds: readonly string[]
  currentContextId: string
}): NarrativeMacroImpactQuality {
  try {
    const nodes = translateNarrativeMacroImpact({
      rawData: parseNarrativeAIJson(input.content),
      activeSubsystemIds: input.activeSubsystemIds,
      allowedEvidenceEventIds: input.allowedEvidenceEventIds,
      currentContextId: input.currentContextId,
    })
    return {
      valid: true,
      reason: '',
      nodes,
      changes: nodes.map((node) => node.change),
    }
  } catch (error) {
    return { valid: false, reason: errorMessage(error) }
  }
}

/** 事件识别必须同时通过已发生元数据、命运意图、时间锚点与未来候选校验。 */
export function inspectNarrativeEventRecognitionQuality(input: {
  content: string
  narrative: ParsedNarrative
  currentContextId: string
  currentTotalDays: number
  existingCandidates: readonly HistoricalEventCandidateAudit[]
  expectedIntentId?: string | null
  deliveredCausalEventIds?: readonly string[]
}): NarrativeEventRecognitionQuality {
  try {
    const result = translateNarrativeAIEventRecognition(parseNarrativeAIJson(input.content), {
      currentContextId: input.currentContextId,
      currentTotalDays: input.currentTotalDays,
    })

    if (input.expectedIntentId) {
      if (!result.metadata.intentResolution) {
        throw new Error(`当前命运意图必须提交判定：${toNarrativeAIIntentId(input.expectedIntentId)}`)
      }
      if (result.metadata.intentResolution.intentId !== input.expectedIntentId) {
        throw new Error(`命运意图编号必须等于 ${toNarrativeAIIntentId(input.expectedIntentId)}`)
      }
    } else if (result.metadata.intentResolution) {
      throw new Error('当前没有待判定命运意图，事件识别不得提交命运意图判定')
    }

    const expectedCausalIds = new Set(input.deliveredCausalEventIds ?? [])
    const causalDispositions = result.metadata.deliveredCausalDispositions ?? []
    const returnedCausalIds = new Set<string>()
    for (const disposition of causalDispositions) {
      if (!expectedCausalIds.has(disposition.causalId)) {
        throw new Error(`到期因果判定引用了未投递编号：${disposition.causalId}`)
      }
      if (returnedCausalIds.has(disposition.causalId)) {
        throw new Error(`到期因果判定重复提交编号：${disposition.causalId}`)
      }
      returnedCausalIds.add(disposition.causalId)
    }
    for (const causalId of expectedCausalIds) {
      if (!returnedCausalIds.has(causalId)) {
        throw new Error(`到期因果必须逐项判定：${causalId}`)
      }
    }
    if (expectedCausalIds.size === 0 && causalDispositions.length > 0) {
      throw new Error('本轮没有投递到期因果，事件识别不得提交到期因果判定')
    }

    validateNarrativeEventMetadataForNarrative(input.narrative, result.metadata)

    const existingFingerprints = new Set(input.existingCandidates.map((audit) => (
      buildNarrativeEventCandidateFingerprint(audit.candidate)
    )))
    const incomingFingerprints = new Set<string>()
    for (const candidate of result.candidates) {
      const fingerprint = buildNarrativeEventCandidateFingerprint(candidate)
      if (existingFingerprints.has(fingerprint)) {
        throw new Error(`待触发事件已经注册：${candidate.title}`)
      }
      if (incomingFingerprints.has(fingerprint)) {
        throw new Error(`事件识别响应重复提交同一候选：${candidate.title}`)
      }
      incomingFingerprints.add(fingerprint)
    }
    return {
      valid: true,
      reason: '',
      metadata: result.metadata,
      candidates: result.candidates,
    }
  } catch (error) {
    return { valid: false, reason: errorMessage(error) }
  }
}

/** 第一次调用只追加本轮触发的条件；常驻输出协议由固定 Prompt 拥有。 */
export function buildNarrativeRoundOutputContract(
  requestBranch = false,
  isOpeningRound = false,
): string | undefined {
  const lines: string[] = []
  if (requestBranch) {
    lines.push('本轮请求命运分支：若高优先级事实允许真实分叉，正文停在玩家作出选择之前并输出分支；否则完整写完正文。')
  }
  if (isOpeningRound) {
    lines.push('这是人生首轮：写清进入当前世界或生活的直接落点，不得无因果跳过数周或数月。')
  }
  return lines.length > 0 ? lines.join('\n') : undefined
}

export function buildNarrativeRepairInstruction(
  quality: NarrativeResponseQuality,
  wordCountTarget: NarrativeWordCountTarget,
  requestBranch = false,
): string {
  const { target } = resolveNarrativeWordCountRange(wordCountTarget)
  return [
    '请保留上一版已经成立的剧情事实，并参照系统提示词末尾的唯一 content 返回结构示例重写完整最终结果。',
    `需要修正：${quality.reason}。`,
    `玩家偏好约 ${target} 字只作节奏参考；格式修复仍需完整保留剧情事实与因果。`,
    ...buildNarrativeAIProtocolRepairReminder(requestBranch),
  ].join('\n')
}
