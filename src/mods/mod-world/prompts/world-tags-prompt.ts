/**
 * Purpose: Define the world-tag extraction contract used by world initialization.
 * Owner: mod-world / world-init.
 * Responsibility: World-tag selection rules and output Schema only.
 */

import { z } from 'zod'

import { stringifyPrompt, type PromptTemplate } from '@/foundation'

/** 世界标签生成输出 Schema（JSON Mode：顶层 object） */
export const worldTagsOutputSchema = z.object({
  tags: z.array(z.string()).min(1),
})

export const WORLD_TAGS_PROMPT_CONTRACT = {
  responsibility: '只把输入中已经成立的世界事实提炼为精炼标签。',
  selection: [
    '每个标签表达一个可辨认的环境、社会、力量、秩序或情绪事实。',
    '相近含义合并为一个更准确的标签，彼此不同的关键氛围分别保留。',
    '标签随世界描述、世界类型与一致性提示共同确定，覆盖输入已经明确建立的关键氛围。',
    '标签使用简短中文词组，直接陈述世界特征。',
  ],
  output: '纯 JSON 对象，根字段为 tags，值为非空字符串数组。',
} as const

const WORLD_TAGS_SYSTEM_PROMPT = stringifyPrompt({
  role: '世界标签提炼专员',
  ...WORLD_TAGS_PROMPT_CONTRACT,
})

export const worldTagsPrompt: PromptTemplate = {
  name: 'world-tags',
  version: '2.2.0',
  mod: 'mod-world',

  systemPrompt: WORLD_TAGS_SYSTEM_PROMPT,

  userPromptTemplate: `{"worldDescription":"{{worldDescription}}","worldType":"{{worldType}}","coherenceHint":"{{coherenceHint}}"}`,

  variables: ['worldDescription', 'worldType', 'coherenceHint'],

  outputFormat: 'json',
  outputSchema: worldTagsOutputSchema,
}
