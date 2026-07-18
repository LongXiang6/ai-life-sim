import { resolveNarrativeWordCountRange } from '../constants/narrative-config'
import {
  buildNarrativeAIProtocolRepairReminder,
  parseNarrativeAIDataJson,
  toNarrativeAIIntentId,
  translateNarrativeAIResponse,
} from './narrative-ai-protocol'
import { extractTaggedMetaEnvelope } from './tagged-meta-envelope'
import { validateIntentResolution } from './branch-intent-resolution'

export type NarrativeStructuredDataStatus = 'valid' | 'omitted' | 'rejected'

export interface NarrativeResponseQuality {
  valid: boolean
  reason: string
  /** 字数偏离只作为提示，绝不阻止消费或触发重写。 */
  lengthAdvisory?: string
  /** 普通轮数据非法时降级为正文+摘要成功，不触发整篇重写。 */
  dataAdvisory?: string
  structuredDataStatus: NarrativeStructuredDataStatus
  narrativeChars: number
  paragraphCount: number
}

function hasCompleteSemanticCore(
  metadata: ReturnType<typeof translateNarrativeAIResponse>,
): boolean {
  return metadata.importance !== undefined
    && metadata.arcStatus !== undefined
    && metadata.semanticSignals !== undefined
}

function failure(reason: string): NarrativeResponseQuality {
  return {
    valid: false,
    reason,
    structuredDataStatus: 'rejected',
    narrativeChars: 0,
    paragraphCount: 0,
  }
}

function failureWithEnvelope(
  reason: string,
  narrative: string,
): NarrativeResponseQuality {
  const paragraphs = narrative
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  return {
    valid: false,
    reason,
    structuredDataStatus: 'rejected',
    narrativeChars: narrative.replace(/\s/gu, '').length,
    paragraphCount: paragraphs.length,
  }
}

/**
 * 最低门禁只要求完整三段正文、独立摘要和结束标记。
 * 普通轮的可选数据区畸形时保留正文与摘要并整包拒绝数据；当前命运意图或
 * 强制命运分支属于条件契约，缺少相应完整数据时才触发一次格式修复。
 */
export function inspectNarrativeResponseQuality(
  content: string,
  wordCountTarget: number,
  expectedIntentId?: string | null,
  requireBranch = false,
): NarrativeResponseQuality {
  const envelope = extractTaggedMetaEnvelope(content)
  if (!envelope) {
    return failure('缺少完整的正文、摘要或结束分区')
  }

  let metadata: ReturnType<typeof translateNarrativeAIResponse> | undefined
  let structuredDataStatus: NarrativeStructuredDataStatus = envelope.dataPresent ? 'rejected' : 'omitted'
  if (envelope.dataPresent) {
    try {
      metadata = translateNarrativeAIResponse(
        parseNarrativeAIDataJson(envelope.dataSection ?? ''),
        envelope.summary,
      )
      structuredDataStatus = 'valid'
    } catch {
      structuredDataStatus = 'rejected'
    }
  }

  if (typeof expectedIntentId === 'string') {
    if (!metadata || !hasCompleteSemanticCore(metadata)) {
      return failureWithEnvelope('当前命运意图要求完整语义数据与命运意图判定', envelope.narrative)
    }
    const intentError = validateIntentResolution(metadata.intentResolution, expectedIntentId)
    if (intentError) return failureWithEnvelope(intentError, envelope.narrative)
  }

  if (requireBranch) {
    if (!metadata || !hasCompleteSemanticCore(metadata) || metadata.branch !== true) {
      return failureWithEnvelope('本轮已请求命运分支，必须返回完整语义数据、分支标题与分支选项', envelope.narrative)
    }
  }

  const paragraphs = envelope.narrative
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  const narrativeChars = envelope.narrative.replace(/\s/gu, '').length
  const { target, preferredMin, preferredMax } = resolveNarrativeWordCountRange(wordCountTarget)

  if (paragraphs.length !== 3) {
    return {
      valid: false,
      reason: `正文必须且只能有三段，当前为 ${paragraphs.length} 段`,
      structuredDataStatus,
      narrativeChars,
      paragraphCount: paragraphs.length,
    }
  }

  const lengthAdvisory = narrativeChars < preferredMin || narrativeChars > preferredMax
    ? `正文约 ${narrativeChars} 字，玩家偏好约 ${target} 字（参考区间 ${preferredMin}—${preferredMax} 字）；保留完整剧情与文笔优先，不触发重写。`
    : undefined
  const dataAdvisory = structuredDataStatus === 'rejected'
    ? '可选数据区未通过完整 Schema，已保留正文与摘要并整包拒绝结构化数据。'
    : undefined

  return {
    valid: true,
    reason: '',
    lengthAdvisory,
    dataAdvisory,
    structuredDataStatus,
    narrativeChars,
    paragraphCount: paragraphs.length,
  }
}

export function buildNarrativeRepairInstruction(
  quality: NarrativeResponseQuality,
  wordCountTarget: number,
  expectedIntentId?: string | null,
  requireBranch = false,
): string {
  const { target } = resolveNarrativeWordCountRange(wordCountTarget)
  const instructions = [
    '上一版未达到最低协议或条件任务门禁，请按系统提示词末尾的标准示例重新输出完整结果，不要解释或点评。',
    `失败原因：${quality.reason}。`,
    `玩家偏好约 ${target} 字仅作节奏参考；不要因为字数偏离删句、压扁行动或重复内容。`,
    '保留上一版中有吸引力的现场、人物声音、行动阻力、可见后果与下一步悬念。',
    ...buildNarrativeAIProtocolRepairReminder(),
  ]
  if (typeof expectedIntentId === 'string') {
    instructions.push(
      `当前命运意图仍在执行：必须返回完整语义核心与“命运意图判定”；“意图编号”严格照抄 ${toNarrativeAIIntentId(expectedIntentId)}。`,
      '语义核心中“重要程度”“情节状态”“语义信号”必须同时存在；当前意图必须使用“不可逆”:true，并使用“命运”或“传承”叙事语域。',
      '命运意图判定必须完整包含：意图编号、可行性、执行方式、状态、风险等级、进度、预计耗时、判定理由；阻碍、前置条件、代价和下一步有内容才写。',
    )
  }
  if (requireBranch) {
    instructions.push(
      '本轮已请求命运分支，必须同时返回“命运分支”:true、“分支标题”和二至四个“分支选项”。',
      '分支数据必须包含完整语义核心：重要程度=高、情节状态、语义信号；语义信号中不可逆=true，叙事语域只能为命运或传承。',
      '正文必须在玩家真正需要选择的现场停下；选项只写行动、立场或方向，不替玩家宣布结果。',
    )
  }
  return instructions.join('\n')
}
