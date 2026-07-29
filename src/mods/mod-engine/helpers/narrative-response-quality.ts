import type { NarrativeWordCountTarget } from '@/foundation'

import { resolveNarrativeWordCountRange } from '../constants/narrative-config'
import {
  buildNarrativeAIProtocolRepairReminder,
  toNarrativeAIIntentId,
  translateNarrativeAISettlement,
} from './narrative-ai-protocol'
import {
  narrativeParser,
  combineNarrativeAndSettlement,
  type ParsedNarrative,
} from '../subsystems/narrative-parser-system'
import { parseNarrativeSettlementEnvelope } from './tagged-meta-envelope'

export interface NarrativeResponseQuality {
  valid: boolean
  reason: string
  parsed?: ParsedNarrative
  narrativeChars: number
  paragraphCount: number
  lengthAdvisory?: string
}

export interface NarrativeSettlementQuality {
  valid: boolean
  reason: string
  parsed?: ParsedNarrative
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** 第一次调用只检查正文及可选玩家分支，不读取任何机器结算字段。 */
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

/** 第二次调用必须完整通过分段、中文 Schema、事件引用与条件字段校验。 */
export function inspectNarrativeSettlementQuality(input: {
  content: string
  narrative: ParsedNarrative
  allowedEvidenceEventIds: readonly string[]
  allowedSubsystemIds: readonly string[]
  expectedIntentId?: string | null
}): NarrativeSettlementQuality {
  try {
    const envelope = parseNarrativeSettlementEnvelope(input.content)
    const settlement = translateNarrativeAISettlement(
      envelope.systemInstructions,
      envelope.data,
      {
        allowedEvidenceEventIds: input.allowedEvidenceEventIds,
        allowedSubsystemIds: input.allowedSubsystemIds,
      },
    )

    if (input.expectedIntentId) {
      if (!settlement.intentResolution) {
        throw new Error(`当前命运意图必须提交判定：${toNarrativeAIIntentId(input.expectedIntentId)}`)
      }
      if (settlement.intentResolution.intentId !== input.expectedIntentId) {
        throw new Error(`命运意图编号必须等于 ${toNarrativeAIIntentId(input.expectedIntentId)}`)
      }
    } else if (settlement.intentResolution) {
      throw new Error('当前没有待判定命运意图，结算不得提交命运意图判定')
    }

    return {
      valid: true,
      reason: '',
      parsed: combineNarrativeAndSettlement(input.narrative, settlement),
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

export function buildNarrativeSettlementRepairInstruction(
  quality: NarrativeSettlementQuality,
  originalResponse: string,
): string {
  return [
    '请依据同一份系统状态、上下文与叙事，参照系统提示词末尾的唯一结算示例重新输出完整结算。',
    `需要修正：${quality.reason}。`,
    '每个系统操作独占一行并从系统1连续编号，最后一行是唯一数据段；返回内容只包含完整结算分段。',
    '【上一版结算响应】',
    originalResponse,
  ].join('\n')
}
