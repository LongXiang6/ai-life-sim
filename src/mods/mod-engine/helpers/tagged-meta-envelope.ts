/**
 * @module tagged-meta-envelope.ts
 * @description 主叙事分区协议提取：正文、摘要、可选数据与确定性结束标记
 * @mod mod-engine
 */

import {
  NARRATIVE_BODY_TAG,
  NARRATIVE_DATA_TAG,
  NARRATIVE_END_TAG,
  NARRATIVE_SUMMARY_TAG,
} from './narrative-ai-protocol'

export interface TaggedMetaEnvelope {
  narrative: string
  summary?: string
  dataPresent: boolean
  dataSection?: string
}

/**
 * 已开始输出分区协议、但尚未完成结束标记时，可安全保留的玩家可见部分。
 * 数据区绝不在这里补全、修复或解释；它仍由完整信封和严格 Schema 负责。
 */
export interface TaggedNarrativePrefix {
  narrative: string
  summary?: string
  /** The prefix reached an explicit section boundary after the body. */
  hasSummaryMarker: boolean
  hasDataMarker: boolean
  hasEndMarker: boolean
}

interface LineMarker {
  lineStart: number
  lineEnd: number
  contentStart: number
}

/** 只识别独占一行的协议标记，避免正文中偶然出现相同字符时误分区。 */
function findLineMarker(content: string, marker: string, fromIndex = 0): LineMarker | null {
  let searchFrom = fromIndex
  while (searchFrom < content.length) {
    const markerIndex = content.indexOf(marker, searchFrom)
    if (markerIndex < 0) return null

    const lineStart = content.lastIndexOf('\n', markerIndex - 1) + 1
    const nextNewline = content.indexOf('\n', markerIndex + marker.length)
    const lineEnd = nextNewline < 0 ? content.length : nextNewline
    const line = content.slice(lineStart, lineEnd).replace(/\r$/u, '').trim()
    if (line === marker) {
      return {
        lineStart,
        lineEnd,
        contentStart: nextNewline < 0 ? content.length : nextNewline + 1,
      }
    }

    searchFrom = markerIndex + marker.length
  }
  return null
}

/**
 * 提取 `正文 -> 可选摘要 -> 可选数据 -> 结束`。
 *
 * 正文和结束标记必填；摘要、数据区都可省略。数据区即使畸形也原样返回，
 * 由唯一 JSON/Schema 权威做整包判定，提取器不补括号、不删字段、不猜语义。
 */
export function extractTaggedMetaEnvelope(content: string): TaggedMetaEnvelope | null {
  const normalized = content.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n')
  const bodyMarker = findLineMarker(normalized, NARRATIVE_BODY_TAG)
  if (!bodyMarker || normalized.slice(0, bodyMarker.lineStart).trim()) return null

  const summaryMarker = findLineMarker(normalized, NARRATIVE_SUMMARY_TAG, bodyMarker.contentStart)
  const dataMarker = findLineMarker(normalized, NARRATIVE_DATA_TAG, bodyMarker.contentStart)
  const endMarker = findLineMarker(normalized, NARRATIVE_END_TAG, bodyMarker.contentStart)
  if (!endMarker || normalized.slice(endMarker.lineEnd).trim()) return null

  if (summaryMarker && summaryMarker.lineStart >= endMarker.lineStart) return null
  if (dataMarker && dataMarker.lineStart >= endMarker.lineStart) return null
  if (summaryMarker && dataMarker && summaryMarker.lineStart >= dataMarker.lineStart) return null

  const sectionStarts = [summaryMarker?.lineStart, dataMarker?.lineStart, endMarker.lineStart]
    .filter((index): index is number => index !== undefined)
  const narrative = normalized.slice(bodyMarker.contentStart, Math.min(...sectionStarts)).trim()
  if (!narrative) return null

  const summaryEnd = dataMarker?.lineStart ?? endMarker.lineStart
  const summary = summaryMarker
    ? normalized.slice(summaryMarker.contentStart, summaryEnd).trim()
    : undefined

  if (!dataMarker) {
    return {
      narrative,
      ...(summary ? { summary } : {}),
      dataPresent: false,
    }
  }

  return {
    narrative,
    ...(summary ? { summary } : {}),
    dataPresent: true,
    dataSection: normalized.slice(dataMarker.contentStart, endMarker.lineStart).trim(),
  }
}

/**
 * 提取以正文标记起始的可见前缀，允许上游在摘要或数据区中途结束。
 * 仅供正文降级使用，不能据此写入结构化状态。
 */
export function extractTaggedNarrativePrefix(content: string): TaggedNarrativePrefix | null {
  const normalized = content.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n')
  const bodyMarker = findLineMarker(normalized, NARRATIVE_BODY_TAG)
  if (!bodyMarker || normalized.slice(0, bodyMarker.lineStart).trim()) return null

  const rawSummaryMarker = findLineMarker(normalized, NARRATIVE_SUMMARY_TAG, bodyMarker.contentStart)
  const rawDataMarker = findLineMarker(normalized, NARRATIVE_DATA_TAG, bodyMarker.contentStart)
  const endMarker = findLineMarker(normalized, NARRATIVE_END_TAG, bodyMarker.contentStart)
  const dataMarker = rawDataMarker && (!endMarker || rawDataMarker.lineStart < endMarker.lineStart)
    ? rawDataMarker
    : null
  const summaryMarker = rawSummaryMarker
    && (!endMarker || rawSummaryMarker.lineStart < endMarker.lineStart)
    && (!dataMarker || rawSummaryMarker.lineStart < dataMarker.lineStart)
    ? rawSummaryMarker
    : null
  const boundaries = [summaryMarker?.lineStart, dataMarker?.lineStart, endMarker?.lineStart]
    .filter((index): index is number => index !== undefined)
  const narrativeEnd = boundaries.length > 0 ? Math.min(...boundaries) : normalized.length
  const narrative = normalized.slice(bodyMarker.contentStart, narrativeEnd).trim()
  if (!narrative) return null

  const hasSummaryMarker = Boolean(summaryMarker)
  const hasDataMarker = Boolean(dataMarker)
  const hasEndMarker = Boolean(endMarker)

  if (!summaryMarker || (dataMarker && summaryMarker.lineStart > dataMarker.lineStart)) {
    return {
      narrative,
      hasSummaryMarker,
      hasDataMarker,
      hasEndMarker,
    }
  }

  const summaryEndCandidates = [dataMarker?.lineStart, endMarker?.lineStart]
    .filter((index): index is number => index !== undefined && index > summaryMarker.lineStart)
  const summaryEnd = summaryEndCandidates.length > 0
    ? Math.min(...summaryEndCandidates)
    : normalized.length
  const summary = normalized.slice(summaryMarker.contentStart, summaryEnd).trim()
  return {
    narrative,
    ...(summary && (hasDataMarker || hasEndMarker) ? { summary } : {}),
    hasSummaryMarker,
    hasDataMarker,
    hasEndMarker,
  }
}

/**
 * 只新增或替换数据区，正文、摘要及其原始换行字节保持不变。
 * 返回 null 表示源内容不是可安全定位分区的完整信封。
 */
export function replaceTaggedMetaDataSection(
  content: string,
  dataSection: string,
): string | null {
  if (!extractTaggedMetaEnvelope(content)) return null

  const bodyMarker = findLineMarker(content, NARRATIVE_BODY_TAG)
  const dataMarker = bodyMarker
    ? findLineMarker(content, NARRATIVE_DATA_TAG, bodyMarker.contentStart)
    : null
  const endMarker = bodyMarker
    ? findLineMarker(content, NARRATIVE_END_TAG, bodyMarker.contentStart)
    : null
  if (!bodyMarker || !endMarker) return null

  const normalizedData = dataSection.trim()
  if (!normalizedData) return null
  const newline = content.includes('\r\n') ? '\r\n' : '\n'

  if (dataMarker && dataMarker.lineStart < endMarker.lineStart) {
    return `${content.slice(0, dataMarker.contentStart)}${normalizedData}${newline}${content.slice(endMarker.lineStart)}`
  }

  return `${content.slice(0, endMarker.lineStart)}${NARRATIVE_DATA_TAG}${newline}${normalizedData}${newline}${content.slice(endMarker.lineStart)}`
}

/** 导出常量，供协议审计确认解析器与 Prompt 使用同一分区协议。 */
export const TAGGED_NARRATIVE_PROTOCOL = {
  body: NARRATIVE_BODY_TAG,
  summary: NARRATIVE_SUMMARY_TAG,
  data: NARRATIVE_DATA_TAG,
  end: NARRATIVE_END_TAG,
} as const
