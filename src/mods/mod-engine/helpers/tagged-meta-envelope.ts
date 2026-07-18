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
  summary: string
  dataPresent: boolean
  dataSection?: string
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
 * 提取 `正文 -> 摘要 -> 可选数据 -> 结束`。
 *
 * 正文、摘要和结束标记始终必填；数据区可省略。数据区即使畸形也原样返回，
 * 由唯一 JSON/Schema 权威做整包判定，提取器不补括号、不删字段、不猜语义。
 */
export function extractTaggedMetaEnvelope(content: string): TaggedMetaEnvelope | null {
  const normalized = content.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n')
  const bodyMarker = findLineMarker(normalized, NARRATIVE_BODY_TAG)
  if (!bodyMarker || normalized.slice(0, bodyMarker.lineStart).trim()) return null

  const summaryMarker = findLineMarker(normalized, NARRATIVE_SUMMARY_TAG, bodyMarker.contentStart)
  if (!summaryMarker) return null

  const endMarker = findLineMarker(normalized, NARRATIVE_END_TAG, summaryMarker.contentStart)
  if (!endMarker || normalized.slice(endMarker.lineEnd).trim()) return null

  const dataMarker = findLineMarker(normalized, NARRATIVE_DATA_TAG, summaryMarker.contentStart)
  if (dataMarker && dataMarker.lineStart >= endMarker.lineStart) return null

  const narrative = normalized.slice(bodyMarker.contentStart, summaryMarker.lineStart).trim()
  const summaryEnd = dataMarker?.lineStart ?? endMarker.lineStart
  const summary = normalized.slice(summaryMarker.contentStart, summaryEnd).trim()
  if (!narrative || !summary) return null

  if (!dataMarker) {
    return { narrative, summary, dataPresent: false }
  }

  return {
    narrative,
    summary,
    dataPresent: true,
    dataSection: normalized.slice(dataMarker.contentStart, endMarker.lineStart).trim(),
  }
}

/** 导出常量，供协议审计确认解析器与 Prompt 使用同一分区协议。 */
export const TAGGED_NARRATIVE_PROTOCOL = {
  body: NARRATIVE_BODY_TAG,
  summary: NARRATIVE_SUMMARY_TAG,
  data: NARRATIVE_DATA_TAG,
  end: NARRATIVE_END_TAG,
} as const
