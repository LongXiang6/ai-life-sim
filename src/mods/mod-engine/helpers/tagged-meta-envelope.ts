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

/** 导出常量，供协议审计确认解析器与 Prompt 使用同一分区协议。 */
export const TAGGED_NARRATIVE_PROTOCOL = {
  body: NARRATIVE_BODY_TAG,
  summary: NARRATIVE_SUMMARY_TAG,
  data: NARRATIVE_DATA_TAG,
  end: NARRATIVE_END_TAG,
} as const
