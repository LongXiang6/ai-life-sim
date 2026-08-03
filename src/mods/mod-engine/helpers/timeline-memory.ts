/**
 * @module timeline-memory.ts
 * @description 压缩系统的本地权重、衰减、遗忘与时间轴格式化
 * @mod mod-engine
 */

import type { CompressedMemoryEvent, CompressedSummaryItem } from '@/foundation'
import { z } from 'zod'

import {
  MEMORY_WEIGHT_MAX,
  calculateMemoryWeight,
  isMemoryEventActive,
} from '@/core/storage/narrative-memory-policy'

import { SUMMARY_COMPLETION_MARKER } from './summary-coverage'

export {
  MEMORY_DECAY_INTERVALS,
  MEMORY_WEIGHT_MAX,
  MEMORY_WEIGHT_MIN,
  calculateMemoryWeight,
  clampMemoryWeight,
  coarseImportanceWeight,
  isMemoryEventActive,
  isMemoryEventForgotten,
  mapImportanceToMemoryWeight,
} from '@/core/storage/narrative-memory-policy'

export interface TimelineSourceFact {
  id: string
  round: number
  time: string
  text: string
  initialWeight: number
  weightAnchorRound: number
  permanent: boolean
}

export const TimelineCompressionOutputSchema = z.object({
  periods: z.array(z.object({
    timeSpan: z.string().min(1),
    events: z.array(z.object({
      text: z.string().min(1),
      occurrenceTime: z.string().min(1),
      sourceIds: z.array(z.string().min(1)).min(1),
      weight: z.number().int().min(1).max(MEMORY_WEIGHT_MAX),
    }).strict()).min(1),
  }).strict()).min(1),
  completionMarker: z.literal(SUMMARY_COMPLETION_MARKER),
}).strict()

export type TimelineCompressionOutput = z.infer<typeof TimelineCompressionOutputSchema>

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

/** 为主叙事加上唯一记忆区标题；无记忆时不发送占位说明。 */
export function formatNarrativeTimelineForPrompt(
  entries: readonly NarrativeTimelineEntry[],
): string {
  const timeline = formatNarrativeTimelineEntries(entries)
  return timeline ? `【时间轴记忆】\n${timeline}` : ''
}

/** 将压缩节点投影为主叙事可见的时间+事件，内部计算字段不外泄。 */
export function projectSummaryToNarrativeTimeline(
  summary: Pick<CompressedSummaryItem, 'startRound' | 'endRound' | 'content' | 'memoryEvents'>,
  currentRound: number,
): NarrativeTimelineEntry[] {
  if (!summary.memoryEvents) {
    const roundSpan = summary.startRound === summary.endRound
      ? `第${summary.startRound}轮`
      : `第${summary.startRound}-${summary.endRound}轮`
    return [{
      timeSpan: roundSpan,
      occurrenceTime: roundSpan,
      text: summary.content,
      sortRound: summary.startRound,
    }]
  }

  return summary.memoryEvents
    .filter((event) => isMemoryEventActive(event, currentRound))
    .map((event) => ({
      timeSpan: event.timeSpan,
      occurrenceTime: event.occurrenceTime,
      text: event.text,
      sortRound: event.sourceRounds.length > 0
        ? Math.min(...event.sourceRounds)
        : summary.startRound,
    }))
}

export function formatSummaryForNarrative(
  summary: Pick<CompressedSummaryItem, 'startRound' | 'endRound' | 'content' | 'memoryEvents'>,
  currentRound: number,
): string {
  return formatNarrativeTimelineEntries(projectSummaryToNarrativeTimeline(summary, currentRound))
}

/** 压缩与存档内部格式；不得用作主叙事投影。 */
export function formatMemoryEvent(event: CompressedMemoryEvent, currentRound: number): string {
  return `${event.text}[${calculateMemoryWeight(event, currentRound)}，${event.occurrenceTime}]`
}

export function formatTimelineEvents(
  events: readonly CompressedMemoryEvent[],
  currentRound: number,
  options?: { includeInactive?: boolean },
): string {
  const visible = options?.includeInactive
    ? [...events]
    : events.filter((event) => isMemoryEventActive(event, currentRound))
  const grouped = new Map<string, CompressedMemoryEvent[]>()
  for (const event of visible) {
    const list = grouped.get(event.timeSpan) ?? []
    list.push(event)
    grouped.set(event.timeSpan, list)
  }
  return [...grouped.entries()]
    .map(([timeSpan, items]) => (
      `${timeSpan}：${items.map((event) => formatMemoryEvent(event, currentRound)).join(' | ')}`
    ))
    .join('\n')
}

export function formatSummaryForPrompt(
  summary: Pick<CompressedSummaryItem, 'content' | 'memoryEvents'>,
  currentRound: number,
): string {
  if (!summary.memoryEvents) return summary.content
  return formatTimelineEvents(summary.memoryEvents, currentRound)
}

export function compressedSummaryId(
  level: number,
  startRound: number,
  endRound: number,
): string {
  return `L${level}:${startRound}-${endRound}`
}

/**
 * 将 AI 的时间段组织与权重结果持久化为摘要节点。
 * 权重 10 的来源不进入 AI 输出，调用方应通过 `permanentEvents` 原样携带。
 */
export function buildCompressedMemoryEvents(
  level: number,
  startRound: number,
  endRound: number,
  output: TimelineCompressionOutput,
  sources: readonly TimelineSourceFact[],
): CompressedMemoryEvent[] {
  const sourceMap = new Map(sources.map((source) => [source.id, source]))
  return output.periods.flatMap((period, periodIndex) => period.events.map((event, eventIndex) => {
    if (!Number.isInteger(event.weight) || event.weight < 1 || event.weight > MEMORY_WEIGHT_MAX) {
      throw new Error(`压缩事件权重超出 1-${MEMORY_WEIGHT_MAX}：${event.weight}`)
    }
    const sourceIds = [...new Set(event.sourceIds)]
    const selected = sourceIds.map((id) => {
      const source = sourceMap.get(id)
      if (!source) throw new Error(`压缩事件引用了未知来源：${id}`)
      return source
    })
    const weightAnchorRound = Math.max(
      startRound,
      ...selected.map((source) => source.weightAnchorRound),
    )
    return {
      id: `L${level}:${startRound}-${endRound}:p${periodIndex + 1}:e${eventIndex + 1}`,
      timeSpan: period.timeSpan.trim(),
      text: event.text.trim(),
      occurrenceTime: event.occurrenceTime.trim(),
      sourceEventIds: sourceIds,
      sourceRounds: [...new Set(selected.map((source) => source.round))].sort((a, b) => a - b),
      initialWeight: event.weight,
      weightAnchorRound,
      permanent: event.weight === MEMORY_WEIGHT_MAX,
    } satisfies CompressedMemoryEvent
  }))
}

export function mergePermanentMemoryEvents(
  events: readonly CompressedMemoryEvent[],
): CompressedMemoryEvent[] {
  return events
    .filter((event) => event.permanent || event.initialWeight >= MEMORY_WEIGHT_MAX)
    .map((event) => structuredClone({ ...event, permanent: true, initialWeight: MEMORY_WEIGHT_MAX }))
}
