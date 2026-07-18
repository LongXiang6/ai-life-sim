/**
 * @module world-tags-prompt.ts
 * @description 氛围标签 Prompt —— 仅 Pipeline tags-fallback 步使用
 *
 * 主路径：worldTags 由 world-dimension-calibration 一次输出。
 * 勿恢复独立的 tags-only / calibration-tags 前置步骤。
 * @mod mod-world
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 世界标签生成输出 Schema（JSON Mode：顶层 object） */
export const worldTagsOutputSchema = z.object({
  tags: z.array(z.string()).min(1),
})

const WORLD_TAGS_SYSTEM_PROMPT = `你是世界标签生成AI。根据世界描述和世界观类型，生成覆盖世界真实氛围所需的全部精炼标签。
输出纯JSON对象 {"tags":["标签1",...]}，不markdown代码块包裹。

// 示例覆盖不同世界观×不同氛围标签：

// 修仙世界
{"tags":["灵气充沛","弱肉强食","宗门林立","天道不仁","秘境遍布","因果轮回"]}

// 星际科幻
{"tags":["科技至上","星际殖民","文明竞争","AI觉醒","资源博弈","真空寂静"]}

// 末日废土
{"tags":["资源匮乏","废墟求生","变异横生","信任崩坏","末日余晖","弱者的团结"]}

// 奇幻魔法
{"tags":["魔力涌动","种族共存","神明干预","黑暗潜伏","契约至上","冒险者的黄金时代"]}

核心约束：
- 标签仅描述此世界真实存在的要素，禁止标注不存在的东西
- 唯心/心相/无灵气世界禁止「灵气充沛」「仙凡并存」
- 不适用的文明层勿生成相关标签（如史前世界勿标「诸侯割据」）
- 标签应简洁，不解释、不评价；不得为了满足固定条数或字符数省略世界描述中已经成立的关键氛围`

export const worldTagsPrompt: PromptTemplate = {
  name: 'world-tags',
  version: '2.1.0',
  mod: 'mod-world',

  systemPrompt: WORLD_TAGS_SYSTEM_PROMPT,

  userPromptTemplate: `{"worldDescription":"{{worldDescription}}","worldType":"{{worldType}}","coherenceHint":"{{coherenceHint}}"}`,

  variables: ['worldDescription', 'worldType', 'coherenceHint'],

  outputFormat: 'json',
  outputSchema: worldTagsOutputSchema,
}
