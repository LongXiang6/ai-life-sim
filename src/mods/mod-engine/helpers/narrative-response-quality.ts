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
import { extractTaggedMetaEnvelope, extractTaggedNarrativePrefix } from './tagged-meta-envelope'
import { validateIntentResolution } from './branch-intent-resolution'

export type NarrativeStructuredDataStatus = 'valid' | 'omitted' | 'rejected'
export type NarrativeConditionalFailure = 'intent' | 'branch'

export interface NarrativeValidationIssue {
  path: string
  currentValue: string
  rule: string
  legalExample: string
}

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
  /** 结构化数据被拒绝时的精确校验摘要，仅供诊断日志使用。 */
  validationError?: string
  /** 数据修复请求使用的完整问题列表，不裁剪 Schema 错误。 */
  validationIssues?: NarrativeValidationIssue[]
}

const plainTextProcessor = new ChineseTextProcessor()

function extractBodyOnlyNarrative(content: string): string | null {
  const trimmed = content.trim()
  if (!trimmed) return null

  const taggedPrefix = extractTaggedNarrativePrefix(trimmed)
  if (taggedPrefix) {
    const hasBoundary = taggedPrefix.hasSummaryMarker
      || taggedPrefix.hasDataMarker
      || taggedPrefix.hasEndMarker
    return hasBoundary ? taggedPrefix.narrative : null
  }

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
  validationError?: string,
  validationIssues?: NarrativeValidationIssue[],
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
    ...(validationError ? { validationError } : {}),
    ...(validationIssues?.length ? { validationIssues } : {}),
  }
}

function serializeValidationValue(value: unknown): string {
  if (value === undefined) return '（缺失）'
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function readValueAtPath(source: unknown, path: readonly PropertyKey[]): unknown {
  let current = source
  for (const segment of path) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<PropertyKey, unknown>)[segment]
  }
  return current
}

function legalExampleForPath(path: string): string {
  const examples: Record<string, string> = {
    重要程度: '"高"',
    情节状态: '"进行中"',
    '语义信号.事件类型': '"日常"',
    '语义信号.冲突强度': '0',
    '语义信号.张力变化': '0',
    '语义信号.行动规模': '"小"',
    '语义信号.不可逆': 'true',
    '语义信号.影响范围': '"个人"',
    '语义信号.叙事语域': '"生活"',
    '语义信号.语域理由': '"本轮只形成个人日常变化"',
    '语义信号.情节类型': '"无"',
    命运分支: 'true',
    分支标题: '"决定下一步"',
    分支选项: '["采取行动一", "采取行动二"]',
    '命运意图判定.意图编号': '"必须照抄本轮指定编号"',
    '命运意图判定.进度': '65',
    '命运意图判定.下一步': '"继续执行当前意图"',
  }
  if (examples[path]) return examples[path]
  if (path.startsWith('命运意图判定.')) {
    return '{"意图编号":"指定编号","可行性":"有条件","执行方式":"逐步执行","状态":"推进中","风险等级":"中","进度":65,"预计耗时":"多个节点","判定理由":"依据已成立正文判断","下一步":"继续执行"}'
  }
  if (path.startsWith('语义信号.')) {
    return '{"事件类型":"日常","冲突强度":0,"张力变化":0,"行动规模":"小","不可逆":false,"影响范围":"个人","叙事语域":"生活","语域理由":"本轮只形成个人日常变化","情节类型":"无"}'
  }
  return '使用中文协议中该字段的合法类型和值；没有内容时省略整个可选字段'
}

function describeNarrativeValidationError(
  error: unknown,
  rawData: unknown,
  rawDataSection: string,
): { summary?: string; issues: NarrativeValidationIssue[] } {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues?: unknown }).issues
    if (Array.isArray(issues)) {
      const validationIssues = issues.map((issue): NarrativeValidationIssue => {
        if (!issue || typeof issue !== 'object') {
          return {
            path: '数据区',
            currentValue: serializeValidationValue(rawData),
            rule: String(issue),
            legalExample: '返回一个完整且符合中文协议的 JSON 对象',
          }
        }
        const rawPath = Array.isArray((issue as { path?: unknown }).path)
          ? (issue as { path: PropertyKey[] }).path
          : []
        const path = rawPath.map(String).join('.') || '数据区'
        const message = typeof (issue as { message?: unknown }).message === 'string'
          ? (issue as { message: string }).message
          : String(issue)
        return {
          path,
          currentValue: serializeValidationValue(readValueAtPath(rawData, rawPath)),
          rule: message,
          legalExample: legalExampleForPath(path),
        }
      })
      return {
        summary: validationIssues.map((issue) => `${issue.path}: ${issue.rule}`).join('; ') || undefined,
        issues: validationIssues,
      }
    }
  }
  const rule = error instanceof Error ? error.message : String(error)
  const issue = {
    path: '数据区',
    currentValue: rawData === undefined ? rawDataSection : serializeValidationValue(rawData),
    rule,
    legalExample: '返回一个完整且符合中文协议的 JSON 对象，不使用 Markdown 代码块',
  }
  return { summary: rule || undefined, issues: [issue] }
}

function buildConditionalIssue(
  path: string,
  currentValue: unknown,
  rule: string,
): NarrativeValidationIssue {
  return {
    path,
    currentValue: serializeValidationValue(currentValue),
    rule,
    legalExample: legalExampleForPath(path),
  }
}

function resolveIntentIssuePath(reason: string): string {
  if (reason.includes('intentId')) return '命运意图判定.意图编号'
  if (reason.includes('progress')) return '命运意图判定.进度'
  if (reason.includes('nextStep')) return '命运意图判定.下一步'
  if (reason.includes('status')) return '命运意图判定.状态'
  if (reason.includes('feasibility')) return '命运意图判定.可行性'
  return '命运意图判定'
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
  let rawData: unknown
  let structuredDataStatus: NarrativeStructuredDataStatus = envelope.dataPresent ? 'rejected' : 'omitted'
  let validationError: string | undefined
  let validationIssues: NarrativeValidationIssue[] = []
  if (envelope.dataPresent) {
    try {
      rawData = parseNarrativeAIDataJson(envelope.dataSection ?? '')
      metadata = translateNarrativeAIResponse(
        rawData,
        envelope.summary,
      )
      structuredDataStatus = 'valid'
    } catch (error) {
      structuredDataStatus = 'rejected'
      const described = describeNarrativeValidationError(
        error,
        rawData,
        envelope.dataSection ?? '',
      )
      validationError = described.summary
      validationIssues = described.issues
    }
  }

  if (requireBranch) {
    if (!metadata || !hasCompleteSemanticCore(metadata) || metadata.branch !== true) {
      const source = rawData && typeof rawData === 'object' && !Array.isArray(rawData)
        ? rawData as Record<string, unknown>
        : undefined
      const issue = buildConditionalIssue(
        '命运分支',
        source?.命运分支,
        '本轮明确要求命运分支，必须为 true，并同时提交分支标题、二至四个分支选项及完整语义核心',
      )
      return failureWithEnvelope(
        '本轮已请求命运分支，必须返回完整语义数据、分支标题与分支选项',
        envelope.narrative,
        'branch',
        validationError,
        [...validationIssues, issue],
      )
    }
  }

  if (typeof expectedIntentId === 'string') {
    if (!metadata || !hasCompleteSemanticCore(metadata)) {
      const source = rawData && typeof rawData === 'object' && !Array.isArray(rawData)
        ? rawData as Record<string, unknown>
        : undefined
      const issue = buildConditionalIssue(
        '命运意图判定',
        source?.命运意图判定,
        `当前命运意图必须提交完整语义核心和命运意图判定；意图编号必须为 ${toNarrativeAIIntentId(expectedIntentId)}`,
      )
      return failureWithEnvelope(
        '当前命运意图要求完整语义数据与命运意图判定',
        envelope.narrative,
        'intent',
        validationError,
        [...validationIssues, issue],
      )
    }
    const intentError = validateIntentResolution(metadata.intentResolution, expectedIntentId)
    if (intentError) {
      const source = rawData && typeof rawData === 'object' && !Array.isArray(rawData)
        ? rawData as Record<string, unknown>
        : undefined
      const path = resolveIntentIssuePath(intentError)
      const aiIntent = source?.命运意图判定 && typeof source.命运意图判定 === 'object'
        ? source.命运意图判定 as Record<string, unknown>
        : undefined
      const key = path.split('.').at(-1)
      const issue = buildConditionalIssue(
        path,
        key && path.includes('.') ? aiIntent?.[key] : source?.命运意图判定,
        intentError,
      )
      return failureWithEnvelope(
        intentError,
        envelope.narrative,
        'intent',
        validationError,
        [...validationIssues, issue],
      )
    }
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
    ...(validationError ? { validationError } : {}),
    ...(validationIssues.length ? { validationIssues } : {}),
  }
}

/**
 * 任何条件 META 失败都不能阻断已经通过正文/结束标记门禁的故事。
 * 调用方必须丢弃整包结构化状态，不得伪造缺失的判定或分支结果。
 */
export function canContinueWithNarrativeBody(
  quality: NarrativeResponseQuality,
  _expectedIntentId?: string | null,
  _requireBranch = false,
): boolean {
  return !quality.valid
    && quality.hasUsableNarrative === true
}

/** 保留正文和摘要，丢弃未通过条件门禁的数据区，供本轮无等待提交。 */
export function preserveNarrativeBodyAndSummary(content: string): string {
  const envelope = extractTaggedMetaEnvelope(content)
  if (envelope && !envelope.dataPresent) return content
  const visible = envelope ?? extractTaggedNarrativePrefix(content)
  if (!visible) return content
  if (
    'hasSummaryMarker' in visible
    && !visible.hasSummaryMarker
    && !visible.hasDataMarker
    && !visible.hasEndMarker
  ) return content
  return [
    NARRATIVE_BODY_TAG,
    visible.narrative,
    ...(visible.summary ? [NARRATIVE_SUMMARY_TAG, visible.summary] : []),
    NARRATIVE_END_TAG,
  ].join('\n')
}

/** 放在本轮最后一段动态上下文中的紧凑检查表，减少长 Prompt 尾部遗忘。 */
export function buildNarrativeRoundOutputContract(
  _expectedIntentId?: string | null,
  _requireBranch = false,
  isOpeningRound = false,
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
  return instructions.join('\n')
}

/** 独立于剧情方向的变化区，只声明本轮允许返回的源变化与条件结果。 */
export function buildNarrativeChangeRequirements(
  expectedIntentId?: string | null,
  requireBranch = false,
): string {
  const instructions = [
    '【本轮变化要求】',
    '只返回本轮正文中已经成立的源变化；没有变化的字段整个省略，不输出空数组、空对象、null、零变化或全量状态。',
    '状态变更只提交“可写状态字段”列出的源字段；派生属性、连锁数值、人口、科技进度和规律推进全部由本地系统计算，不得代算或补写。',
  ]
  if (typeof expectedIntentId === 'string') {
    instructions.push(
      `当前命运意图必须返回完整语义核心与“命运意图判定”，意图编号严格等于 ${toNarrativeAIIntentId(expectedIntentId)}。`,
    )
  } else {
    instructions.push('当前没有待判定命运意图时，省略“命运意图判定”。')
  }
  if (requireBranch) {
    instructions.push('本轮强制命运分支，必须返回完整语义核心、命运分支=true、分支标题和二至四个分支选项。')
  } else {
    instructions.push('本轮不强制新增命运分支；未形成命运分支时省略命运分支、分支标题和分支选项。')
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

function buildDataRepairExample(
  expectedIntentId?: string | null,
  requireBranch = false,
): Record<string, unknown> {
  const example: Record<string, unknown> = {
    重要程度: '高',
    情节状态: '进行中',
    语义信号: {
      事件类型: '冲突',
      冲突强度: 60,
      张力变化: 3,
      行动规模: '中',
      不可逆: true,
      影响范围: '关系圈',
      叙事语域: '命运',
      语域理由: '本轮已经形成不可逆的关系与行动后果',
      情节类型: '任务',
    },
  }
  if (requireBranch) {
    example.命运分支 = true
    example.分支标题 = '决定下一步'
    example.分支选项 = ['采取行动一', '采取行动二']
  }
  if (typeof expectedIntentId === 'string') {
    example.命运意图判定 = {
      意图编号: toNarrativeAIIntentId(expectedIntentId),
      可行性: '有条件',
      执行方式: '逐步执行',
      状态: '推进中',
      风险等级: '中',
      进度: 65,
      预计耗时: '多个节点',
      判定理由: '依据已成立正文判断',
      下一步: '继续执行当前意图',
    }
  }
  return example
}

/** 正文有效时的专用修复说明：只要求完整数据对象，不允许重写正文或摘要。 */
export function buildNarrativeDataRepairInstruction(
  quality: NarrativeResponseQuality,
  originalDataSection: string,
  expectedIntentId?: string | null,
  requireBranch = false,
): string {
  const issues = quality.validationIssues?.length
    ? quality.validationIssues
    : [buildConditionalIssue('数据区', originalDataSection, quality.reason)]
  const conditions = [
    typeof expectedIntentId === 'string'
      ? `当前命运意图编号：${toNarrativeAIIntentId(expectedIntentId)}；必须返回完整语义核心与命运意图判定。`
      : '当前没有必须判定的命运意图。',
    requireBranch
      ? '本轮强制命运分支：必须返回完整语义核心、命运分支=true、分支标题和二至四个分支选项。'
      : '本轮不强制新增命运分支；原数据没有分支时不得凭空新增。',
  ]
  return [
    '【修复目标】只返回修复后的完整数据区 JSON 对象；禁止输出正文、摘要、分区标签、Markdown、解释或点评。',
    '保留原数据中已经合法且与正文一致的字段，只修复下列错误；无法从正文成立的可选字段应整个省略，不得猜测。',
    ...issues.flatMap((issue, index) => [
      `【问题 ${index + 1}】`,
      `失败路径：${issue.path}`,
      `当前值：${issue.currentValue}`,
      `标准规则：${issue.rule}`,
      `合法示例：${issue.legalExample}`,
    ]),
    '【本轮条件】',
    ...conditions,
    '【完整合法形状示例；只参考字段形状，事实和值必须来自正文与原始数据】',
    JSON.stringify(buildDataRepairExample(expectedIntentId, requireBranch)),
    '【原始数据区；必须整包修复后完整返回】',
    originalDataSection.trim() || '（原输出缺少数据区）',
  ].join('\n')
}
