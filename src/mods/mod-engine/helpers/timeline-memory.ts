/**
 * Purpose: Format full stories and compressed memories into one chronological projection.
 * Owner: mod-engine
 * Responsibility: Timeline formatting only; memory owners retain source data and weights.
 */

import type { CompressedMemoryEvent, CompressedSummaryItem } from '@/foundation'

/** 主叙事唯一可见的记忆投影；不携带权重、层级、来源 ID 或衰减状态。 */
export interface NarrativeTimelineEntry {
  timeSpan: string
  occurrenceTime: string
  text: string
  sortRound: number
  sortTotalDays?: number
}

function normalizeTimelineText(value: string): string {
  return value.replace(/\r\n?/gu, '\n').trim()
}

/** 按时间阶段组织故事记忆，同一阶段的每个事件单独一行。 */
export function formatNarrativeTimelineEntries(
  entries: readonly NarrativeTimelineEntry[],
): string {
  const normalized = entries
    .map((entry) => ({
      ...entry,
      timeSpan: normalizeTimelineText(entry.timeSpan),
      occurrenceTime: normalizeTimelineText(entry.occurrenceTime),
      text: normalizeTimelineText(entry.text),
    }))
    .filter((entry) => entry.timeSpan && entry.occurrenceTime && entry.text)
    .sort((a, b) => (
      a.sortRound - b.sortRound
      || (a.sortTotalDays ?? Number.MAX_SAFE_INTEGER) - (b.sortTotalDays ?? Number.MAX_SAFE_INTEGER)
      || a.occurrenceTime.localeCompare(b.occurrenceTime, 'zh-CN')
      || a.text.localeCompare(b.text, 'zh-CN')
    ))

  const seen = new Set<string>()
  const groups = new Map<string, NarrativeTimelineEntry[]>()
  for (const entry of normalized) {
    const semanticText = entry.text.replace(/^【发生上下文：[^】]+】\n/u, '')
    const dedupeKey = `${entry.timeSpan}\u0000${entry.occurrenceTime}\u0000${semanticText}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    const group = groups.get(entry.timeSpan) ?? []
    group.push(entry)
    groups.set(entry.timeSpan, group)
  }

  return [...groups.entries()].map(([timeSpan, events]) => {
    const lines = events.map((event) => {
      const textLines = event.text.split('\n')
      return [
        `- [${event.occurrenceTime}] ${textLines[0]}`,
        ...textLines.slice(1).map((line) => line ? `  ${line}` : ''),
      ].join('\n')
    })
    return [`【时间阶段：${timeSpan}】`, ...lines].join('\n')
  }).join('\n\n')
}

/** 为主叙事输出同时间合并的 JSON 字符串数组。 */
export function formatNarrativeTimelineForPrompt(
  entries: readonly NarrativeTimelineEntry[],
): string[] {
  const normalized = entries
    .map((entry) => ({
      ...entry,
      occurrenceTime: normalizeTimelineText(entry.occurrenceTime),
      text: normalizeTimelineText(entry.text).replace(/^【发生上下文：[^】]+】\n/u, ''),
    }))
    .filter((entry) => entry.occurrenceTime && entry.text)
    .sort((a, b) => (
      a.sortRound - b.sortRound
      || (a.sortTotalDays ?? Number.MAX_SAFE_INTEGER) - (b.sortTotalDays ?? Number.MAX_SAFE_INTEGER)
      || a.occurrenceTime.localeCompare(b.occurrenceTime, 'zh-CN')
    ))
  const grouped = new Map<string, string[]>()
  for (const entry of normalized) {
    const facts = grouped.get(entry.occurrenceTime) ?? []
    if (!facts.includes(entry.text)) facts.push(entry.text)
    grouped.set(entry.occurrenceTime, facts)
  }
  return [...grouped.entries()].map(([time, facts]) => `${time}：${facts.join('；')}`)
}

/** 将压缩节点投影为主叙事可见的时间+事件，内部计算字段不外泄。 */
export function projectSummaryToNarrativeTimeline(
  summary: Pick<CompressedSummaryItem, 'sourceRound' | 'content' | 'memoryEvents'>,
): NarrativeTimelineEntry[] {
  if (summary.memoryEvents.length === 0) {
    const roundLabel = `第${summary.sourceRound}轮`
    return [{
      timeSpan: roundLabel,
      occurrenceTime: roundLabel,
      text: summary.content,
      sortRound: summary.sourceRound,
    }]
  }

  return summary.memoryEvents.map((event) => ({
    timeSpan: event.timeSpan,
    occurrenceTime: event.occurrenceTime,
    text: event.text,
    sortRound: summary.sourceRound,
  }))
}

export function formatSummaryForNarrative(
  summary: Pick<CompressedSummaryItem, 'sourceRound' | 'content' | 'memoryEvents'>,
): string {
  return formatNarrativeTimelineEntries(projectSummaryToNarrativeTimeline(summary))
}

export function formatTimelineEvents(
  events: readonly CompressedMemoryEvent[],
): string {
  const grouped = new Map<string, CompressedMemoryEvent[]>()
  for (const event of events) {
    const list = grouped.get(event.timeSpan) ?? []
    list.push(event)
    grouped.set(event.timeSpan, list)
  }
  return [...grouped.entries()]
    .map(([timeSpan, items]) => (
      `${timeSpan}：${items.map((event) => `${event.occurrenceTime}，${event.text}`).join(' | ')}`
    ))
    .join('\n')
}

export function formatSummaryForPrompt(
  summary: Pick<CompressedSummaryItem, 'content' | 'memoryEvents'>,
): string {
  return summary.memoryEvents.length > 0 ? formatTimelineEvents(summary.memoryEvents) : summary.content
}
