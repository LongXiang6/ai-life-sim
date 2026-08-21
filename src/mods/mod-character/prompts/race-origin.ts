/**
 * Purpose: Define the non-default-race origin generation Prompt.
 * Owner: mod-character.
 * Responsibility: One character's starting race-origin explanation only.
 */

import { stringifyPrompt, type PromptTemplate } from '@/foundation'

const RACE_ORIGIN_SYSTEM_PROMPT = stringifyPrompt({
  role: '异族来源传记专员',
  responsibility: '只解释当前角色为何以这一非默认种族存在于当前世界，以及这项来源在开局时留下了什么处境。',
  writing: [
    '从世界规律、角色种族和角色背景中选择一条能够贯穿全文的来源因果。',
    '用第二人称书写已经发生的由来，让身体特征、来源代价、他人反应和当前生活处境彼此连接。',
    '选择少量具体动作、物件、声音或触感承载世界质地，使角色来源清楚而仍为未来经历保留空间。',
    '叙述自然收束在角色创建时已经成立的状态。',
  ],
  output: '只返回完整中文正文，不附标题、字段名或格式包装。',
})

export const raceOriginPrompt: PromptTemplate = {
  name: 'race-origin',
  version: '3.0.0',
  mod: 'mod-character',
  systemPrompt: RACE_ORIGIN_SYSTEM_PROMPT,
  userPromptTemplate: '',
  variables: [],
  outputFormat: 'text',
}
