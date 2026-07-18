import { resolveNarrativeWordCountRange } from '../constants/narrative-config'
import {
  NarrativeResponseSchema,
  normalizeNarrativeResponseMetadata,
} from './narrative-semantic-signals'
import { extractTaggedMetaEnvelope } from './tagged-meta-envelope'

export interface NarrativeResponseQuality {
  valid: boolean
  reason: string
  /** 字数偏离只作为提示，绝不阻止消费或触发重写。 */
  lengthAdvisory?: string
  narrativeChars: number
  paragraphCount: number
}

/**
 * 只校验协议、Schema 和段落结构，不从正文词汇猜测事件语义。
 * 字数是玩家偏好提示，不是质量门禁；偏离目标时保留完整故事，不触发重写。
 */
export function inspectNarrativeResponseQuality(
  content: string,
  wordCountTarget: number,
): NarrativeResponseQuality {
  const envelope = extractTaggedMetaEnvelope(content)
  if (!envelope) {
    return { valid: false, reason: '缺少完整的 [NARRATIVE]/[META] 标签信封', narrativeChars: 0, paragraphCount: 0 }
  }

  let metadata: unknown
  try {
    metadata = normalizeNarrativeResponseMetadata(JSON.parse(envelope.metaJson))
  } catch {
    return { valid: false, reason: 'META 不是完整合法的 JSON 对象', narrativeChars: 0, paragraphCount: 0 }
  }
  if (!NarrativeResponseSchema.safeParse(metadata).success) {
    return { valid: false, reason: 'META 字段形状与运行时 Schema 不一致', narrativeChars: 0, paragraphCount: 0 }
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
      narrativeChars,
      paragraphCount: paragraphs.length,
    }
  }

  const lengthAdvisory = narrativeChars < preferredMin || narrativeChars > preferredMax
    ? `正文约 ${narrativeChars} 字，玩家偏好约 ${target} 字（参考区间 ${preferredMin}—${preferredMax} 字）；保留完整剧情与文笔优先，不触发重写。`
    : undefined

  return { valid: true, reason: '', lengthAdvisory, narrativeChars, paragraphCount: paragraphs.length }
}

export function buildNarrativeRepairInstruction(
  quality: NarrativeResponseQuality,
  wordCountTarget: number,
): string {
  const { target } = resolveNarrativeWordCountRange(wordCountTarget)
  return [
    '上一版未通过协议或结构门禁，请只为修复输出格式从头重写完整的 [NARRATIVE] 与 [META]，不要解释或点评。',
    `失败原因：${quality.reason}。`,
    `玩家偏好约 ${target} 字仅作节奏参考；不要因为字数偏离而删掉完整句、压扁人物行动或重复生成内容。`,
    '优先恢复三段自然分隔、同一条因果主线和完整的可见后果；保留最有吸引力的现场、人物声音、行动阻力与下一步悬念。',
    'META.changes 每项必须严格为 {"id":"...","description":"...","changes":{...}}；属性字段不能放在该项顶层；没有明确变化就返回 []。',
    '若包含命运分叉，META.branchOptions 必须是2—4个字符串组成的数组，不要输出带 title/description 的对象。',
    '此次重写的 META.keyEvents 只保留 1 个主事件；META 必须严格使用既定字段和数组形状。',
  ].join('\n')
}
