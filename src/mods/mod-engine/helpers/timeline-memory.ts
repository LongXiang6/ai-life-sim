/**
 * Purpose: Format full stories and compressed memories into one chronological projection.
 * Owner: mod-engine
 * Responsibility: Timeline formatting only; memory owners retain source data and weights.
 */

import type { CompressedMemoryEvent, CompressedSummaryItem } from '@/foundation'

/** 主叙事唯一可见的记忆投影；内部派生字段不会进入格式化文本。 */
export interface NarrativeTimelineEntry {
  timeSpan: string
  occurrenceTime: string
  text: string
  sortRound: number
  displayAge?: number
  sortTotalDays?: number
  /** 同一压缩来源回合的内部派生因果组；不会进入 AI 文本。 */
  causalGroupId?: string
  /** 基于同轮最高原始权重计算的内部派生保留优先级；不改写 source weight。 */
  retentionPriority?: number
}

export interface SameRoundMemoryRetention {
  causalGroupId: string
  retentionPriority: number
}

function normalizeRetentionWeight(weight: number | undefined): number {
  // 02 协议的最低权重为 2；旧摘要缺失权重时按该最低有效值计算派生视图。
  if (typeof weight !== 'number' || !Number.isFinite(weight)) return 2
  const numericWeight = Math.trunc(weight)
  return Math.min(10, Math.max(1, numericWeight))
}

/**
 * 计算同一压缩回合内事件的派生保留信息。
 *
 * 该函数只读取事件，不修改事件或其原始 weight。当前系统没有遗忘消费者，
 * 因此结果仅作为时间轴的内部派生视图，为未来生命周期策略保留因果组和优先级。
 * 不推断事件之间的跨回合或语义因果关系；同一 sourceRound 内的事件共享一个组。
 */
export function deriveSameRoundMemoryRetention(
  sourceRound: number,
  events: readonly CompressedMemoryEvent[],
): SameRoundMemoryRetention[] {
  const causalGroupId = `round-memory:${sourceRound}`
  if (events.length === 0) return []

  const normalizedWeights = events.map((event) => normalizeRetentionWeight(event.weight))
  const highestWeight = Math.max(...normalizedWeights)

  return normalizedWeights.map((sourceWeight) => {
    if (sourceWeight >= highestWeight) {
      return { causalGroupId, retentionPriority: highestWeight }
    }

    const lowerWeightPenalty = sourceWeight < 3 || sourceWeight < highestWeight / 2 ? 2 : 1
    return {
      causalGroupId,
      retentionPriority: Math.max(1, highestWeight - lowerWeightPenalty),
    }
  })
}

function normalizeTimelineText(value: string): string {
  return value.replace(/\r\n?/gu, '\n').trim()
}

function formatAgePrefixedStory(age: number | undefined, story: string): string {
  if (typeof age !== 'number' || !Number.isFinite(age)) return story
  return `${Math.max(0, Math.floor(age))}岁：${story}`
}

/**
 * 保留已提交正文中的完整事实证据；历史职责由固定 Prompt 约束，不在此猜测结果句。
 * 结局总结只补充已有事实，不能替代包含身份、关系与资源变化的正文。
 */
export function projectNarrativeResultForPrompt(input: {
  text: string
  displayAge?: number
  endingSummary?: string
  branchTitle?: string
  branchOptions?: readonly string[]
  resolvedChoice?: string
}): string {
  const narrative = normalizeTimelineText(input.text).replace(/^⟦正文⟧(?:\r?\n)*/u, '').trim()
  const endingSummary = normalizeTimelineText(input.endingSummary ?? '')
  const facts = narrative ? [narrative] : []
  if (endingSummary && endingSummary !== narrative) facts.push(endingSummary)
  const branchTitle = normalizeTimelineText(input.branchTitle ?? '')
  const branchOptions = (input.branchOptions ?? [])
    .map((option) => normalizeTimelineText(option))
    .filter(Boolean)
  const resolvedChoice = normalizeTimelineText(input.resolvedChoice ?? '')
  if (!resolvedChoice && branchTitle && branchOptions.length > 0) {
    facts.push(`未决分支：${branchTitle}（${branchOptions.join('、')}）`)
  }
  if (resolvedChoice) facts.push(`已确认选择：${resolvedChoice}`)
  return formatAgePrefixedStory(input.displayAge, facts.join('；'))
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

/** 为主叙事输出按既有顺序合并的年龄索引事实。 */
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
  const grouped = new Map<string, { displayAge?: number, facts: string[] }>()
  for (const entry of normalized) {
    const group = grouped.get(entry.occurrenceTime) ?? { displayAge: entry.displayAge, facts: [] }
    if (!group.facts.includes(entry.text)) group.facts.push(entry.text)
    grouped.set(entry.occurrenceTime, group)
  }
  return [...grouped.values()].map((group) => (
    formatAgePrefixedStory(group.displayAge, group.facts.join('；'))
  ))
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

  const retention = deriveSameRoundMemoryRetention(summary.sourceRound, summary.memoryEvents)
  return summary.memoryEvents.map((event, index) => ({
    timeSpan: event.timeSpan,
    occurrenceTime: event.occurrenceTime,
    text: event.text,
    sortRound: summary.sourceRound,
    causalGroupId: retention[index]?.causalGroupId,
    retentionPriority: retention[index]?.retentionPriority,
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
