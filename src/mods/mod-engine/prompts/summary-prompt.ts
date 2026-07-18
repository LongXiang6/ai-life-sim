/**
 * @module summary-prompt.ts
 * @description 叙事总结 Prompt 构建 —— 纯 JSON 结构化格式
 * @mod mod-engine
 *
 * 来源: summary-compressor-spec.md §7 buildSummaryPrompt 函数完整实现
 */

import type { PromptTemplate, YearEvent, WorldSetting, CharacterState } from '@/foundation'

import { SAFETY_GUIDE, stringifyPrompt } from '@/foundation'
import { SUMMARY_COMPLETION_MARKER } from '../helpers/summary-coverage'

import { z } from 'zod'

/** L2-L6 各级别只改变组织方式，不得通过更高层级删除输入事实。 */
const LEVEL_FORMAT: Record<number, string> = {
  2: '按时间顺序输出完整事实索引，每个事实或可合并的同类事实一行，以"- "开头',
  3: '按时间区间组织完整因果摘要，保留人物、触发、行动、关系变化、后果与未解线索',
  4: '按跨区间主线组织完整因果摘要，同时保留每条输入摘要中不可替代的事实',
  5: '以时间和主题双索引组织完整历史摘要，保证每条输入摘要都有可追踪覆盖',
  6: '形成长期历史档案摘要，保留全部人物、事件、因果、关系、结果和未解决线索',
}

/**
 * 构建总结 System Prompt（JSON 格式）
 */
export function buildSummarySystemPrompt(level: 1 | 2 | 3 | 4 | 5 | 6 = 1): string {
  if (level === 1) {
    return stringifyPrompt({
      role: '叙事总结器。将一段时间的叙事内容压缩为绝对客观的事件列表。',
      outputFormat: `纯文本，每个事件一行，以"- "开头，按时间顺序排列；确认全部输入事实均已覆盖后，最后单独输出 ${SUMMARY_COMPLETION_MARKER}。`,
      constraints: [
        '按时间顺序列出所有发生的事件',
        '绝对客观，禁止评价性描述（禁用"取得了巨大成就""表现出了非凡勇气"等）',
        '只总结 eventRecords.narrative 中明确写出的事实，不补写未出现的模拟系统状态、数值变化或隐藏因果',
        'eventRecords.digest 是本轮 AI 已提交的一句话事实压缩；只用于确认事件主线，不得扩写其中未在正文出现的内容',
        'eventRecords.keyEvents 是本轮 AI 已提交的带权事件；importance 越高越优先保留，低分事件可以合并，但不得让高分事件被日常细节淹没',
        '结构化 importance 只表示保留优先级，不得把分值本身写进摘要正文，也不得据此推断正文没有写出的状态',
        '只提取剧情事实、后果和关系变化；忽略铺垫描写、感官细节、心理句和修辞性句子',
        '当前 MVP 中健康、经济、声望、关系、修炼、战力等模拟系统可能延后；除非叙事正文明确发生，否则不要把它们当成已落地状态',
        '包含叙事正文中明确发生的角色事件、社会事件与环境变化',
        '每个时间段至少一条记录',
        '禁止"这几年都在修炼""日复一日"等模糊概括',
        '允许合并重复表达，但不得因字符数、条数、token 预算或层级提高而省略任何独立事实',
        `如果无法完整覆盖全部输入，不得伪造概略或输出完成标记；让本次压缩失败并保留原始内容`,
      ],
      example: `- 童年期：家族变故。小明展现修炼天赋，被宗门收入门下。\n- 少年期：宗门大比。小明结识挚友小红，获得宗门传承。\n- 青年期：邪道入侵。小明临危受命，带领同门抵御外敌。\n${SUMMARY_COMPLETION_MARKER}`,
      safety: SAFETY_GUIDE,
    })
  }

  return stringifyPrompt({
    role: '叙事总结器',
    outputFormat: `${LEVEL_FORMAT[level]}；确认全部输入摘要均有覆盖后，最后单独输出 ${SUMMARY_COMPLETION_MARKER}。`,
    constraints: [
      '只压缩输入摘要中已经出现的事实，禁止推断未出现的模拟系统状态或数值变化',
      '每条输入摘要都必须有可追踪覆盖；保留人物、事件、因果、关系变化、后果和未解决线索',
      '允许合并重复表达，但不得因字符数、条数、token 预算或层级提高而省略独立事实',
      '如果无法完整覆盖全部输入，不得伪造概略或输出完成标记；让本次压缩失败并保留低层摘要',
    ],
    safety: SAFETY_GUIDE,
  })
}

/**
 * 构建事件时间字符串
 *
 * 来源: summary.ts 第 63-72 行
 */
function buildTimeStr(e: YearEvent): string {
  const eraInfo =
    e.displayEraName !== undefined && e.displayEraYear !== undefined
      ? `${e.displayEraName}${e.displayEraYear}年`
      : e.eraName
        ? `${e.eraName}${e.eraYear}年`
        : ''

  const timeLabel = e.timeLabel ? `${e.timeLabel}` : ''
  return [eraInfo, timeLabel].filter(Boolean).join(' ')
}

/**
 * 构建总结 User Prompt
 *
 * 来源: summary.ts 第 41-85 行
 *
 * @param events 待压缩的事件数组
 * @param world 世界设定
 * @param character 角色信息
 * @param existingSummaries 已有的高层级摘要列表
 * @param resolvedBranches 已解决的分支选择
 */
export function buildSummaryPrompt(
  events: YearEvent[],
  world: WorldSetting,
  character: CharacterState,
  existingSummaries: Array<{ range: string; content: string }> = [],
  resolvedBranches?: Record<number, string>,
): { system: string; user: string } {
  const system = buildSummarySystemPrompt(1)

  // 构建 JSON 用户提示
  const userData: Record<string, unknown> = {
    character: `${character.name}（${character.gender || '未知'}）`,
    world: world.name,
  }

  const eventRecords = events.map((e) => {
    const record: Record<string, unknown> = {
    age: e.age,
    time: buildTimeStr(e),
    narrative: e.narrative,
    }
    if (e.importance) record.importance = e.importance
    if (e.digest) record.digest = e.digest
    if (e.keyEvents && e.keyEvents.length > 0) {
      record.keyEvents = e.keyEvents.map((event) => ({
        text: event.text,
        importance: event.importance,
        ...(event.entities && event.entities.length > 0 ? { entities: event.entities } : {}),
      }))
    }
    return record
  })
  userData.eventRecords = eventRecords

  if (existingSummaries.length > 0) {
    userData.existingSummaries = existingSummaries
  }

  if (resolvedBranches && Object.keys(resolvedBranches).length > 0) {
    userData.playerChoices = Object.entries(resolvedBranches).map(([id, choice]) => ({
      round: Number(id),
      choice,
    }))
  }

  return { system, user: stringifyPrompt(userData) }
}

/**
 * 叙事总结 Prompt 模板（声明式包装，实际调用使用 buildSummaryPrompt）
 */
export const summaryPrompt: PromptTemplate = {
  name: 'summary',
  version: '2.1.0',
  mod: 'mod-engine',
  systemPrompt: stringifyPrompt({
    role: '叙事总结器。将叙事内容压缩为客观事件列表。',
    outputFormat: `纯文本，每事件一行以"- "开头，按时间排序；完整覆盖后以 ${SUMMARY_COMPLETION_MARKER} 结尾`,
    constraints: [
      '绝对客观禁止评价',
      '只总结叙事正文明确发生的事实',
      '忽略场景描写、心理描写和修辞，只提取事件',
      '不补写延后模拟系统的状态或数值变化',
      '每时间段至少一条',
      '不得按字符数、条数或 token 预算省略独立事实；无法完整覆盖时不要输出完成标记',
    ],
    safety: SAFETY_GUIDE,
  }),
  userPromptTemplate: stringifyPrompt({
    character: '{{character}}',
    world: '{{world}}',
    eventRecords: '{{eventRecords}}',
  }),
  // 注意：此模板通过 buildSummaryPrompt 直接使用，不经过 buildPrompt 管道，故 variables 仅用于注册发现
  variables: [],
  outputFormat: 'text',
  outputSchema: z.string(),
}
