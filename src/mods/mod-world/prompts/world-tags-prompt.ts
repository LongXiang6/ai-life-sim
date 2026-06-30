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
import { stringifyPrompt } from '@/foundation'

/** 世界标签生成输出 Schema（JSON Mode：顶层 object） */
export const worldTagsOutputSchema = z.object({
  tags: z.array(z.string()).min(3).max(12),
})

export const worldTagsPrompt: PromptTemplate = {
  name: 'world-tags',
  version: '1.1.0',
  mod: 'mod-world',

  systemPrompt: stringifyPrompt({
    role: '世界标签生成 AI',
    task: '根据世界配置与用户维度选择，生成描述性标签；对 AI 决定模式的维度可自行判定最适值',
    outputFormat: '纯 JSON 对象 { "tags": string[] }，不要 markdown 代码块包裹',
    constraints: [
      '返回 JSON 对象，tags 字段为 5-8 个世界标签字符串',
      '先按 dimensionChoices 了解用户对各维度的决定权：AI决定模式下的维度可自行判定最适配置',
      '再按 coherenceHint 与 worldDescription 分析世界观，标签仅描述本世界真实存在的要素',
      'worldDescription 优先级高于 essenceTag / civilizationStage；标签不得与描述矛盾',
      '唯心/心相/无灵气世界：禁止「灵气充沛」「仙凡并存」「洪荒黎明」「原始纪元」等不适用标签',
      '不适用的文明层勿生成相关标签（如纯史前地猿世界勿标「诸侯割据」）',
      '标签简洁（2-8 字）',
      '用户选的 adaptive/custom 维度值作为参考，标签须与之协调',
    ],
    tagCategories: [
      { name: '氛围类', examples: ['祥和', '战乱', '神秘', '压抑', '繁荣', '衰退', '动荡'] },
      { name: '力量类', examples: ['灵气充沛', '魔力枯竭', '科技至上', '血脉为尊'] },
      { name: '文明类', examples: ['礼崩乐坏', '盛世太平', '诸侯割据', '大一统'] },
      { name: '环境类', examples: ['山峦叠嶂', '汪洋大陆', '无尽星空', '虚空位面'] },
      { name: '社会类', examples: ['等级森严', '自由平等', '弱肉强食', '和谐共生'] },
    ],
    exampleOutput: { tags: ['灵气充沛', '诸侯割据', '灵气复苏', '弱肉强食', '仙凡并存'] },
  }),

  userPromptTemplate: stringifyPrompt({
    worldDescription: '{{worldDescription}}',
    coherenceHint: '{{coherenceHint}}',
    coherenceNote: '{{coherenceNote}}',
    worldType: '{{worldType}}',
    instruction: '根据以下世界配置与维度选择生成 5-8 个描述性标签',
    outputInstruction: '输出纯 JSON 对象 { "tags": ["标签1", ...] }',
    worldName: '{{worldName}}',
    essenceTag: '{{essenceTag}}',
    powerSystemTag: '{{powerSystemTag}}',
    civilizationStage: '{{civilizationStage}}',
    spatialForm: '{{spatialForm}}',
    dimensionChoices: '{{dimensionChoices}}',
    dimensionOptions: '{{dimensionOptions}}',
    powerCeilingPresets: '{{powerCeilingPresets}}',
  }),

  variables: [
    'worldName', 'essenceTag', 'powerSystemTag', 'civilizationStage', 'spatialForm',
    'worldDescription', 'dimensionChoices', 'dimensionOptions', 'powerCeilingPresets',
    'coherenceHint', 'coherenceNote', 'worldType',
  ],

  outputFormat: 'json',
  outputSchema: worldTagsOutputSchema,
}
