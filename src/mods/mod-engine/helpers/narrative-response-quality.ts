import { resolveNarrativeWordCountRange } from '../constants/narrative-config'
import {
  buildNarrativeAIProtocolRepairReminder,
  NARRATIVE_BODY_TAG,
  NARRATIVE_END_TAG,
  NARRATIVE_SUMMARY_TAG,
  parseNarrativeAIDataJson,
  toNarrativeAIIntentId,
  translateNarrativeAIResponse,
} from './narrative-ai-protocol'
import { ChineseTextProcessor } from './chinese-text-processor'
import { extractTaggedMetaEnvelope } from './tagged-meta-envelope'
import { validateIntentResolution } from './branch-intent-resolution'

export type NarrativeStructuredDataStatus = 'valid' | 'omitted' | 'rejected'
export type NarrativeConditionalFailure = 'intent' | 'branch'

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
  /** 条件 META 失败的归属；正文完整时调用方可按条件选择继续推进。 */
  conditionalFailure?: NarrativeConditionalFailure
  /** 已通过协议提取出的正文仍可作为玩家可见回合结果。 */
  hasUsableNarrative?: boolean
}

const plainTextProcessor = new ChineseTextProcessor()

function extractBodyOnlyNarrative(content: string): string | null {
  const trimmed = content.trim()
  if (!trimmed) return null

  // A JSON response is a protocol-shaped payload, so never mistake an error
  // message or an arbitrary field for player-visible narrative text.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null
      const candidate = (parsed as Record<string, unknown>)['正文']
      if (typeof candidate !== 'string' || !candidate.trim()) return null
      if (!plainTextProcessor.extractLongestChineseBlock(candidate)) return null
      return candidate.trim()
    } catch {
      return null
    }
  }

  return plainTextProcessor.extractLongestChineseBlock(trimmed)?.trim() ?? null
}

function buildBodyOnlyQuality(narrative: string): NarrativeResponseQuality {
  const paragraphs = narrative
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  return {
    valid: true,
    reason: '',
    structuredDataStatus: 'omitted',
    narrativeChars: narrative.replace(/\s/gu, '').length,
    paragraphCount: paragraphs.length,
    hasUsableNarrative: true,
  }
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
    hasUsableNarrative: false,
  }
}

function failureWithEnvelope(
  reason: string,
  narrative: string,
  conditionalFailure?: NarrativeConditionalFailure,
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
    ...(conditionalFailure ? { conditionalFailure } : {}),
    hasUsableNarrative: narrative.trim().length > 0,
  }
}

/**
 * 最低门禁只要求可识别的非空完整正文；标准信封带结束标记时可继续提取摘要，
 * 摘要与普通数据均可省略，段落数量不参与判定。无信封的纯正文只作为玩家可见
 * 降级结果，不获得任何结构化写入权限。
 * 普通轮的可选数据区畸形时保留正文并整包拒绝数据；当前命运意图或
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
    const plainNarrative = extractBodyOnlyNarrative(content)
    if (plainNarrative) {
      // A body-only degradation is still an immediate player-visible success, but
      // it cannot satisfy a current intent or a player-requested fate branch.
      // Mark that missing conditional work explicitly so it can be repaired in
      // the background without withholding the story body.
      if (requireBranch) {
        return failureWithEnvelope(
          '本轮已请求命运分支，纯正文不能替代分支标题与分支选项',
          plainNarrative,
          'branch',
        )
      }
      if (typeof expectedIntentId === 'string') {
        return failureWithEnvelope(
          '当前命运意图要求完整语义数据与命运意图判定',
          plainNarrative,
          'intent',
        )
      }
      return buildBodyOnlyQuality(plainNarrative)
    }
    return failure('缺少可识别的完整叙事正文')
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

  if (requireBranch) {
    if (!metadata || !hasCompleteSemanticCore(metadata) || metadata.branch !== true) {
      return failureWithEnvelope(
        '本轮已请求命运分支，必须返回完整语义数据、分支标题与分支选项',
        envelope.narrative,
        'branch',
      )
    }
  }

  if (typeof expectedIntentId === 'string') {
    if (!metadata || !hasCompleteSemanticCore(metadata)) {
      return failureWithEnvelope(
        '当前命运意图要求完整语义数据与命运意图判定',
        envelope.narrative,
        'intent',
      )
    }
    const intentError = validateIntentResolution(metadata.intentResolution, expectedIntentId)
    if (intentError) return failureWithEnvelope(intentError, envelope.narrative, 'intent')
  }

  const paragraphs = envelope.narrative
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  const narrativeChars = envelope.narrative.replace(/\s/gu, '').length
  const { target, preferredMin, preferredMax } = resolveNarrativeWordCountRange(wordCountTarget)

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
    hasUsableNarrative: true,
  }
}

/**
 * 任何条件 META 失败都不能阻断已经通过正文/结束标记门禁的故事。
 * 调用方必须丢弃整包结构化状态，不得伪造缺失的判定或分支结果。
 */
export function canContinueWithNarrativeBody(
  quality: NarrativeResponseQuality,
  expectedIntentId?: string | null,
  requireBranch = false,
): boolean {
  return !quality.valid
    && quality.hasUsableNarrative === true
}

/** 保留正文和摘要，丢弃未通过条件门禁的数据区，供本轮无等待提交。 */
export function preserveNarrativeBodyAndSummary(content: string): string {
  const envelope = extractTaggedMetaEnvelope(content)
  if (!envelope || !envelope.dataPresent) return content
  return [
    NARRATIVE_BODY_TAG,
    envelope.narrative,
    ...(envelope.summary ? [NARRATIVE_SUMMARY_TAG, envelope.summary] : []),
    NARRATIVE_END_TAG,
  ].join('\n')
}

/** 放在本轮最后一段动态上下文中的紧凑检查表，减少长 Prompt 尾部遗忘。 */
export function buildNarrativeRoundOutputContract(
  expectedIntentId?: string | null,
  requireBranch = false,
  isOpeningRound = false,
  focusedChoice?: string,
): string {
  const instructions = [
    '【本轮输出契约；生成前最后自检】',
    ...buildNarrativeAIProtocolRepairReminder(),
    '正文段落数量自由；只要正文非空、剧情完整且分区协议可解析，就不得因段数重写。摘要没有高价值事实时直接省略，不触发修复。',
    '压力、受阻和拖延不是默认推进方式；没有既有直接因果时，允许并优先考虑学习掌握、安心发育、休整、成果兑现、认可或关系回暖，不得凭空新增机构、观察者或门槛拖延进展。',
    '生成前只做短检查：先锁定本轮唯一主线，再检查已成立事实和结束标记；不要输出思考过程。',
  ]
  if (isOpeningRound) {
    instructions.push(
      '这是人生首轮：必须写清角色如何进入当前世界或当前生活，以及抵达后的直接落点和最初处境；不得无因果直接跳过数周或数月。原生本地角色则用现场、家庭、职责或关键关系建立起点。只有玩家明确要求从中途或既定关系开始时才可跳时，并交代必要过渡。',
    )
  }
  if (typeof expectedIntentId === 'string') {
    instructions.push(
      `当前命运意图必须返回完整语义核心与“命运意图判定”，意图编号严格等于 ${toNarrativeAIIntentId(expectedIntentId)}。`,
    )
  }
  if (focusedChoice?.trim()) {
    instructions.push(
      `【当前唯一主线】玩家已选择“${focusedChoice.trim()}”；正文必须立即推进该行动并给出可见回应，不得换题、拖延或替玩家决定未选结果。`,
    )
  }
  if (requireBranch) {
    instructions.push('本轮强制命运分支，必须返回完整语义核心、分支标题和二至四个分支选项。')
  }
  return instructions.join('\n')
}

export function buildNarrativeRepairInstruction(
  quality: NarrativeResponseQuality,
  wordCountTarget: number,
  expectedIntentId?: string | null,
  requireBranch = false,
): string {
  const { target } = resolveNarrativeWordCountRange(wordCountTarget)
  const instructions = [
    '上一版未达到最低协议或条件任务门禁，请按修复系统提示中的标准示例重新输出完整结果，不要解释或点评。',
    `失败原因：${quality.reason}。`,
    `玩家偏好约 ${target} 字仅作节奏参考；不要因为字数偏离删句、压扁行动或重复内容。`,
    '保留上一版中有吸引力的现场、人物声音、行动发展、可见后果与下一步牵引；不要为修复格式新增压力或障碍。',
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
