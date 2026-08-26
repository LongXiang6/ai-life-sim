/**
 * Purpose: Project the recent complete stories used by continuity calls.
 * Owner: mod-engine
 * Responsibility: Select and normalize the current story plus the preceding four rounds.
 *
 * @module recent-story-context.ts
 * @description 后台 AI 共用的最近故事完整投影
 * @mod mod-engine
 */

import type { YearEvent } from '@/foundation'

import type { NarrativeChunk } from '../types'

/** 02/03 的详细故事派生窗口：当前来源回合加此前最多四轮。 */
export const RECENT_STORY_WINDOW = 5
export const RECENT_STORY_PREVIOUS_WINDOW = RECENT_STORY_WINDOW - 1

export interface RecentStorySource {
  round: number
  text: string
  totalBasePoints?: number
  totalDays?: number
  timeLabel?: string
  branchTitle?: string
  branchOptions?: readonly string[]
  resolvedChoice?: string
  resolvedChoiceRound?: number
}

export interface RecentStoryProjection {
  回合: number
  规范时间: {
    基础点: number | null
    总天数: number | null
    时间标签: string | null
  }
  故事全文: string
  分支?: {
    标题: string
    选项: string[]
  }
  已确认选择?: {
    内容: string
    确认回合: number | null
  }
}

function projectRecentStory(source: RecentStorySource): RecentStoryProjection {
  const timeLabel = source.timeLabel?.trim()
  const branchTitle = source.branchTitle?.trim()
  const branchOptions = source.branchOptions
    ?.map((option) => option.trim())
    .filter(Boolean)
  const resolvedChoice = source.resolvedChoice?.trim()

  return {
    回合: source.round,
    规范时间: {
      基础点: Number.isSafeInteger(source.totalBasePoints) ? source.totalBasePoints! : null,
      总天数: Number.isSafeInteger(source.totalDays) ? source.totalDays! : null,
      时间标签: timeLabel || null,
    },
    故事全文: source.text,
    ...(branchTitle && branchOptions && branchOptions.length > 0
      ? {
          分支: {
            标题: branchTitle,
            选项: branchOptions,
          },
        }
      : {}),
    ...(resolvedChoice
      ? {
          已确认选择: {
            内容: resolvedChoice,
            确认回合: Number.isSafeInteger(source.resolvedChoiceRound)
              ? source.resolvedChoiceRound!
              : null,
          },
        }
      : {}),
  }
}

/** 只选择当前调用所需的最近五轮；每轮正文和字段均完整保留。 */
export function buildRecentStoryProjection(
  sources: readonly RecentStorySource[],
): RecentStoryProjection[] {
  const projected: RecentStoryProjection[] = []
  const startIndex = Math.max(0, sources.length - RECENT_STORY_WINDOW)
  for (let index = startIndex; index < sources.length; index += 1) {
    projected.push(projectRecentStory(sources[index]))
  }
  return projected
}

export function buildRecentStoriesForRound(input: {
  history: readonly NarrativeChunk[]
  currentRound: number
  currentStory: Omit<RecentStorySource, 'round'>
}): RecentStoryProjection[] {
  const firstCommittedRound = Math.max(1, input.currentRound - input.history.length)
  const sources: RecentStorySource[] = input.history.map((entry, index) => ({
    round: firstCommittedRound + index,
    text: entry.text,
    totalDays: entry.totalDays,
    totalBasePoints: entry.totalBasePoints,
    timeLabel: entry.displayTimeLabel,
    branchTitle: entry.branchTitle,
    branchOptions: entry.branchOptions,
    resolvedChoice: entry.resolvedChoice,
    resolvedChoiceRound: entry.resolvedChoiceRound,
  }))
  sources.push({ round: input.currentRound, ...input.currentStory })
  return buildRecentStoryProjection(sources)
}

export function buildRecentStoriesFromYearEvents(
  events: readonly YearEvent[],
): RecentStoryProjection[] {
  return buildRecentStoryProjection(events.map((event) => ({
    round: event.id,
    text: event.narrative,
    totalDays: event.totalDays,
    totalBasePoints: event.totalBasePoints,
    timeLabel: event.timeLabel,
    branchTitle: event.branchTitle,
    branchOptions: event.branchOptions,
    resolvedChoice: event.resolvedChoice,
    resolvedChoiceRound: event.resolvedChoiceRound,
  })))
}
