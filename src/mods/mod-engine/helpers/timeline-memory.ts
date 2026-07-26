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
  clampMemoryWeight,
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
    }).strict()).min(1),
  }).strict()).min(1),
  completionMarker: z.literal(SUMMARY_COMPLETION_MARKER),
}).strict()

export type TimelineCompressionOutput = z.infer<typeof TimelineCompressionOutputSchema>

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

function bestSource(sources: TimelineSourceFact[], sourceIds: string[]): TimelineSourceFact | undefined {
  return [...sources]
    .filter((source) => sourceIds.includes(source.id))
    .sort((a, b) => (
      Number(b.permanent) - Number(a.permanent)
      || b.initialWeight - a.initialWeight
      || b.weightAnchorRound - a.weightAnchorRound
      || a.round - b.round
    ))[0] ?? sources[0]
}

/**
 * 将 AI 的时间段组织结果转成由本地权重字段驱动的摘要节点。
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
    const sourceIds = [...new Set(event.sourceIds)].filter((id) => sourceMap.has(id))
    const selected = sourceIds.map((id) => sourceMap.get(id)!).filter(Boolean)
    const anchor = bestSource(sources as TimelineSourceFact[], sourceIds)
    return {
      id: `L${level}:${startRound}-${endRound}:p${periodIndex + 1}:e${eventIndex + 1}`,
      timeSpan: period.timeSpan.trim(),
      text: event.text.trim(),
      occurrenceTime: event.occurrenceTime.trim(),
      sourceEventIds: sourceIds,
      sourceRounds: [...new Set(selected.map((source) => source.round))].sort((a, b) => a - b),
      initialWeight: clampMemoryWeight(anchor?.initialWeight ?? 5),
      weightAnchorRound: anchor?.weightAnchorRound ?? startRound,
      permanent: Boolean(anchor?.permanent || (anchor?.initialWeight ?? 0) >= MEMORY_WEIGHT_MAX),
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
