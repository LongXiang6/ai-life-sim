/**
 * @module past-history-prompt.ts
 * @description 过去历史事件 AI 生成 Prompt —— 为世界生成创建前的重大历史节点
 * @mod mod-world
 */

import type { PromptTemplate } from '@/foundation'
import { stringifyPrompt } from '@/foundation'

import { z } from 'zod'

import { worldEventNarratorSystemPrompt } from './world-init-prompt-shared'

export const pastHistoryOutputSchema = z.unknown()

export const pastHistoryPrompt: PromptTemplate = {
  name: 'past-history',
  version: '1.1.0',
  mod: 'mod-world',

  systemPrompt: worldEventNarratorSystemPrompt,

  userPromptTemplate: stringifyPrompt({
    taskMode: 'past',
    worldDescription: '{{worldDescription}}',
    coherenceHint: '{{coherenceHint}}',
    coherenceNote: '{{coherenceNote}}',
    worldName: '{{worldName}}',
    essenceTag: '{{essenceTag}}',
    civilizationStage: '{{civilizationStage}}',
    worldType: '{{worldType}}',
    worldviewStyleHint: '{{worldviewStyleHint}}',
    instruction: '为世界编纂上古史（纪元元年之前的历史背景）',
    eventCount: '{{count}}',
    eraAnchorYear: '{{eraAnchorYear}}',
    timeRange: '大约 {{maxYearsAgo}} 年前 到 {{minYearsAgo}} 年前（相对世界纪元 {{eraAnchorYear}} 年）',
    yearFieldNote: 'year 为负整数，表示距纪元 {{eraAnchorYear}} 年的偏移（-100 = 100年前）',
    requirements: [
      '生成 eventCount 个事件，year 必须为负整数，按从古到今排序',
      '禁止世界观绝对纪年；未启用文明层不得出现在事件中',
      'description 须 50–80 汉字',
    ],
    outputInstruction: '输出纯JSON数组',
  }),

  variables: [
    'worldName', 'essenceTag', 'civilizationStage', 'worldviewStyleHint',
    'worldDescription', 'coherenceHint', 'coherenceNote', 'worldType', 'count',
    'eraAnchorYear', 'maxYearsAgo', 'minYearsAgo',
  ],

  outputFormat: 'json',
  outputSchema: pastHistoryOutputSchema,
}
