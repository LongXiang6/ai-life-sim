/**
 * @module summary-prompt.ts
 * @description 叙事时间轴压缩 Prompt 构建
 * @mod mod-engine
 */

import type { PromptTemplate, YearEvent, WorldSetting, CharacterState } from '@/foundation'
import { stringifyPrompt } from '@/foundation'
import { SUMMARY_COMPLETION_MARKER } from '../helpers/summary-coverage'
import type { TimelineSourceFact } from '../helpers/timeline-memory'
import type { RecentStoryProjection } from '../helpers/recent-story-context'
import { z } from 'zod'

const LEVEL_FORMAT: Record<number, string> = {
  1: '按最细时间段输出每个来源事实，允许合并重复表达，但必须覆盖全部 sourceIds',
  2: '按 16 轮时间跨度组织完整事实和因果，保留人物、行动、关系变化、后果与未解线索',
  3: '按 64 轮时间轴组织长期历史，保留每条输入事实的可追踪覆盖，不创造新事实',
}

export function buildSummarySystemPrompt(level: 1 | 2 | 3 = 1): string {
  return stringifyPrompt({
    role: '叙事时间轴压缩器。只按输入事实建立可检索的时间段记忆。',
    outputFormat: 'JSON object: {"periods":[{"timeSpan":"...","events":[{"text":"...","occurrenceTime":"...","sourceIds":["..."],"weight":5}]}],"completionMarker":"[SUMMARY_COMPLETE]"}',
    constraints: [
      LEVEL_FORMAT[level],
      '只写 sourceFacts 或 existingCompressedHistory 已明确出现的事实，禁止补写模拟状态、数值或隐藏因果',
      '每个 sourceId 必须至少出现在一个输出事件的 sourceIds 中；不能用一句总括替代独立事实',
      '输出事件必须给出发生时间 occurrenceTime；timeSpan 必须是可读的时间范围或时间点',
      '每个输出事件必须给出整数权重 weight，范围 1-10；只依据事实对角色身份、核心关系、长期目标、持续能力、世界位置、后续因果和不可替代性的影响判断，不依据题材、情绪强度或措辞判断',
      '权重 1-3 表示对后续连续性影响很小，4-6 表示普通但仍可追溯的人生事实，7-9 表示会持续影响后续选择或状态的重要事实，10 只用于失去后会破坏长期连续性的永久事实',
      '最近故事只用于理解连续性、已确认选择和权重，不得把仅出现在最近故事而未出现在 sourceFacts 的内容写入压缩事件',
      '低权重的相似事件可以合并到同一时间段，但不能删除其 sourceIds',
      `completionMarker 必须严格等于 ${SUMMARY_COMPLETION_MARKER}；无法完整覆盖时省略该标记，让本次调用失败`,
    ],
    fidelity: '压缩只忠实保存已提交事实，不增加题材过滤、改写或遗漏规则。',
  })
}

export function buildTimelineCompressionPrompt(input: {
  level: 1 | 2 | 3
  character: CharacterState
  world: WorldSetting
  sourceFacts: readonly TimelineSourceFact[]
  recentStories: readonly RecentStoryProjection[]
  existingCompressedHistory?: readonly { level: number; startRound: number; endRound: number; content: string }[]
}): { system: string; user: string } {
  return {
    system: buildSummarySystemPrompt(input.level),
    user: stringifyPrompt({
      character: `${input.character.name}（${input.character.gender || '未知'}）`,
      world: input.world.name,
      level: `L${input.level}`,
      sourceFacts: input.sourceFacts,
      recentStories: input.recentStories,
      existingCompressedHistory: input.existingCompressedHistory ?? [],
    }),
  }
}

function buildTimeStr(e: YearEvent): string {
  const eraInfo = e.displayEraName !== undefined && e.displayEraYear !== undefined
    ? `${e.displayEraName}${e.displayEraYear}年`
    : e.eraName
      ? `${e.eraName}${e.eraYear}年`
      : ''
  return [eraInfo, e.timeLabel ? `${e.timeLabel}` : ''].filter(Boolean).join(' ')
}

/** 兼容旧调用方的 L1 Prompt 构建；生产压缩器使用 buildTimelineCompressionPrompt。 */
export function buildSummaryPrompt(
  events: YearEvent[],
  world: WorldSetting,
  character: CharacterState,
  existingSummaries: Array<{ range: string; content: string }> = [],
  resolvedBranches?: Record<number, string>,
): { system: string; user: string } {
  const eventRecords = events.map((event) => ({
    age: event.age,
    time: buildTimeStr(event),
    narrative: event.narrative,
    ...(event.importance ? { importance: event.importance } : {}),
    ...(event.digest ? { digest: event.digest } : {}),
    ...(event.keyEvents?.length ? {
      keyEvents: event.keyEvents.map((keyEvent) => ({
        text: keyEvent.text,
        importance: keyEvent.importance,
        ...(keyEvent.entities?.length ? { entities: keyEvent.entities } : {}),
      })),
    } : {}),
  }))
  const userData: Record<string, unknown> = {
    character: `${character.name}（${character.gender || '未知'}）`,
    world: world.name,
    eventRecords,
    sourceFacts: events.map((event) => ({
      id: `round-${event.id}`,
      round: event.id,
      time: buildTimeStr(event),
      text: event.narrative,
    })),
  }
  if (existingSummaries.length > 0) userData.existingSummaries = existingSummaries
  if (resolvedBranches && Object.keys(resolvedBranches).length > 0) {
    userData.playerChoices = Object.entries(resolvedBranches).map(([id, choice]) => ({
      round: Number(id),
      choice,
    }))
  }
  return { system: buildSummarySystemPrompt(1), user: stringifyPrompt(userData) }
}

export const summaryPrompt: PromptTemplate = {
  name: 'summary',
  version: '3.0.0',
  mod: 'mod-engine',
  systemPrompt: stringifyPrompt({
    role: '叙事时间轴压缩器。',
    outputFormat: `JSON 时间轴对象；完整覆盖后 completionMarker 为 ${SUMMARY_COMPLETION_MARKER}`,
    constraints: [
      '按时间顺序组织事实',
      '不创造输入没有的状态或因果',
      '所有 sourceIds 必须可追溯',
    ],
    fidelity: '只忠实保存输入中已经成立的事实。',
  }),
  userPromptTemplate: stringifyPrompt({
    character: '{{character}}',
    world: '{{world}}',
    sourceFacts: '{{sourceFacts}}',
  }),
  variables: [],
  outputFormat: 'json',
  outputSchema: z.record(z.string(), z.unknown()),
}
