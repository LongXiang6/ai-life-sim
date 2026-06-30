/**
 * @module race-origin.ts
 * @description AI 非默认种族由来生成提示词（对齐废弃项目 race-origin-generator.ts）
 * @mod mod-character
 */

import type { PromptTemplate } from '@/foundation'
import { stringifyPrompt } from '@/foundation'

/**
 * 种族由来生成的 System Prompt
 */
export const RACE_ORIGIN_SYSTEM_PROMPT = stringifyPrompt({
  role: '世界观合理性校验引擎',
  task: '当玩家选择了一个非常规种族（非该世界默认种族）时，生成一段简短的解释，说明为什么这个个体能够存在于这个世界中',
  constraints: [
    '结合世界描述、种族名称、角色背景，生成合理的存在解释',
    '输出 50-100 字纯文本，直接解释即可，不需要任何格式包装',
    '不要输出"因为这是架空世界"之类的敷衍回答',
    '不要评价或判断，只做解释',
  ],
})

/**
 * 种族由来 Prompt 模板
 */
export const raceOriginPrompt: PromptTemplate = {
  name: 'race-origin',
  version: '1.0.0',
  mod: 'mod-character',
  systemPrompt: RACE_ORIGIN_SYSTEM_PROMPT,
  userPromptTemplate: stringifyPrompt({
    worldDescription: '{{worldDescription}}',
    race: '{{race}}',
    characterBackground: '{{characterBackground}}',
    instruction: '请为这个非默认种族生成一个合理的存在解释',
  }),
  variables: ['worldDescription', 'race', 'characterBackground'],
  outputFormat: 'text',
}
