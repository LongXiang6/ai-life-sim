/**
 * @module summary-prompt.ts
 * @description 叙事总结 Prompt 构建 —— 纯 JSON 结构化格式
 * @mod mod-engine
 *
 * 来源: summary-compressor-spec.md §7 buildSummaryPrompt 函数完整实现
 */

import type { PromptTemplate, YearEvent, WorldSetting, CharacterState } from '@/foundation'

import { SAFETY_GUIDE, stringifyPrompt } from '@/foundation'

import { computeSummaryCharLimit } from '../utils'

import { z } from 'zod'

/** L2-L6 各级别输出格式 —— 使用时间尺度中性的描述，避免"时代/纪元/文明"等宏大术语误导 AI */
const LEVEL_FORMAT: Record<number, { format: string; fields: string[] }> = {
  2: { format: '关键词事件列表，每要点一行以"- "开头', fields: ['关键人物', '重大事件', '重要转折'] },
  3: { format: '结构性摘要：区间：xxx | 主要事件：xxx | 人物：xxx', fields: ['区间概括', '主要事件', '关键人物名'] },
  4: { format: '概括性摘要：区间：xxx | 主线：xxx | 人物：xxx', fields: ['时间范围', '主要脉络', '关键人物名'] },
  5: { format: '高度浓缩摘要：区间：xxx | 主线：xxx | 人物：xxx', fields: ['时间范围', '主要脉络', '关键人物名'] },
  6: { format: '极简摘要：区间：xxx | 主线：xxx | 人物：xxx', fields: ['时间范围', '主要脉络', '关键人物名'] },
}

/**
 * 构建总结 System Prompt（JSON 格式）
 */
export function buildSummarySystemPrompt(charLimit: number, level: 1 | 2 | 3 | 4 | 5 | 6 = 1): string {
  if (level === 1) {
    return stringifyPrompt({
      role: '叙事总结器。将一段时间的叙事内容压缩为绝对客观的事件列表。',
      outputFormat: '纯文本，每个事件一行，以"- "开头，按时间顺序排列。',
      constraints: [
        '按时间顺序列出所有发生的事件',
        '绝对客观，禁止评价性描述（禁用"取得了巨大成就""表现出了非凡勇气"等）',
        '只总结 eventRecords.narrative 中明确写出的事实，不补写未出现的模拟系统状态、数值变化或隐藏因果',
        '只提取剧情事实、后果和关系变化；忽略铺垫描写、感官细节、心理句和修辞性句子',
        '当前 MVP 中健康、经济、声望、关系、修炼、战力等模拟系统可能延后；除非叙事正文明确发生，否则不要把它们当成已落地状态',
        '包含叙事正文中明确发生的角色事件、社会事件与环境变化',
        '每个时间段至少一条记录',
        '禁止"这几年都在修炼""日复一日"等模糊概括',
        `不超过${charLimit}字`,
      ],
      example: '- 童年期：家族变故。小明展现修炼天赋，被宗门收入门下。\n- 少年期：宗门大比。小明结识挚友小红，获得宗门传承。\n- 青年期：邪道入侵。小明临危受命，带领同门抵御外敌。',
      safety: SAFETY_GUIDE,
    })
  }

  const fmt = LEVEL_FORMAT[level]
  return stringifyPrompt({
    role: '叙事总结器',
    outputFormat: fmt.format,
    constraints: [
      `仅保留：${fmt.fields.join('、')}`,
      '只压缩输入摘要中已经出现的事实，禁止推断未出现的模拟系统状态或数值变化',
      `不超过${charLimit}字`,
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
 * @param tokenBudget Token 预算（用于计算字数限制）
 */
export function buildSummaryPrompt(
  events: YearEvent[],
  world: WorldSetting,
  character: CharacterState,
  existingSummaries: Array<{ range: string; content: string }> = [],
  resolvedBranches?: Record<number, string>,
  tokenBudget?: number,
): { system: string; user: string } {
  const charLimit = tokenBudget
    ? computeSummaryCharLimit(tokenBudget)
    : 4800

  const system = buildSummarySystemPrompt(charLimit)

  // 构建 JSON 用户提示
  const userData: Record<string, unknown> = {
    character: `${character.name}（${character.gender || '未知'}）`,
    world: world.name,
    charLimit,
  }

  const eventRecords = events.map((e) => ({
    age: e.age,
    time: buildTimeStr(e),
    narrative: e.narrative,
  }))
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
  version: '2.0.1',
  mod: 'mod-engine',
  systemPrompt: stringifyPrompt({
    role: '叙事总结器。将叙事内容压缩为客观事件列表。',
    outputFormat: '纯文本，每事件一行以"- "开头，按时间排序',
    constraints: [
      '绝对客观禁止评价',
      '只总结叙事正文明确发生的事实',
      '忽略场景描写、心理描写和修辞，只提取事件',
      '不补写延后模拟系统的状态或数值变化',
      '每时间段至少一条',
      '不超过指定字数',
    ],
    safety: SAFETY_GUIDE,
  }),
  userPromptTemplate: stringifyPrompt({
    character: '{{character}}',
    world: '{{world}}',
    charLimit: '{{charLimit}}',
    eventRecords: '{{eventRecords}}',
  }),
  // 注意：此模板通过 buildSummaryPrompt 直接使用，不经过 buildPrompt 管道，故 variables 仅用于注册发现
  variables: [],
  outputFormat: 'text',
  outputSchema: z.string(),
}
