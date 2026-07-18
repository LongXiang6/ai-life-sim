/**
 * @module world-dimension-calibration-prompt.ts
 * @description 【主路径】维度推断 + 世界校准合并 Prompt —— Pipeline Step 1 单次 AI 调用
 *
 * 禁止拆回 dimension-inference + calibration 两步独立调用。
 * 仅当缓存命中但缺 W02 时，Pipeline 才单独调用 world-calibration-prompt（fallback）。
 * @mod mod-world
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'
import { stringifyPrompt } from '@/foundation'

import { dimensionInferenceOutputSchema } from './dimension-inference-schema'
import {
  worldCalibrationBundleOutputSchema,
  worldCalibrationOutputSchema,
} from './world-calibration-prompt'
import { WORLD_CONFIG_AI_FIELD_KEYS } from './world-config-prompt'

/** 合并输出：维度推断 + 校准 + W02 + 氛围标签 */
export const worldDimensionCalibrationOutputSchema = z.object({
  dimensions: dimensionInferenceOutputSchema,
  calibration: worldCalibrationOutputSchema,
  aiDetailedParameters: worldCalibrationBundleOutputSchema.shape.aiDetailedParameters,
  worldTags: worldCalibrationBundleOutputSchema.shape.worldTags,
})

export type WorldDimensionCalibrationOutput = z.infer<typeof worldDimensionCalibrationOutputSchema>

export const worldDimensionCalibrationPrompt: PromptTemplate = {
  name: 'world-dimension-calibration',
  version: '1.1.0',
  mod: 'mod-world',

  systemPrompt: stringifyPrompt({
    role: '世界维度分析 + 模拟校准 AI（合并调用）',
    task: [
      '单次输出完整 JSON：先据 worldDescription 推断五维框架参数（dimensions），',
      '再基于推断结果与 dimensionChoices 校准模拟层（calibration + aiDetailedParameters + worldTags）',
      'dimensions 与 calibration.metadata 须自洽，禁止前后矛盾',
    ].join(''),
    dimensionDefinitions: {
      powerSystem: {
        label: '力量体系',
        options: ['无', '修仙', '魔法', '灵能', '科技', '异能', '混合'],
      },
      worldviewEssence: {
        label: '世界观本质',
        options: ['唯物主义', '唯心主义', '唯物修仙', '唯心修仙', '混合'],
      },
      civilizationStage: {
        label: '文明阶段',
        options: ['原始', '古代', '中世纪', '近代', '现代', '未来'],
      },
      spatialForm: {
        label: '世界空间形态',
        options: ['位面', '宇宙', '位面晶壁群系', '多元宇宙群系', '诸天万界'],
      },
      powerCeiling: { label: '力量上限', description: '1-24 阶，对照 powerCeilingPresets' },
      worldType: {
        label: '世界类型',
        options: ['materialist', 'idealist', 'mixed'],
      },
    },
    dimensionInferenceRules: [
      'worldDescription 为最高优先级',
      'powerCeiling 对照 powerCeilingPresets 选最匹配阶位',
      '魔法/巫师体系→powerSystem=魔法，勿标修仙；科技主导→materialist',
      '标签必须从 options 选取，不得自造中文维度名',
      'dimensionChoices 中 adaptive/custom 维度：dimensions 输出须与用户选择一致',
      'dimensionChoices 中 AI决定 维度：可据描述自由推断',
    ],
    calibrationRules: [
      '顶层含 dimensions、calibration、aiDetailedParameters、worldTags',
      'calibration 稀疏；aiDetailedParameters 全 43 字段必填且扁平（禁止 worldview/sociology 等嵌套分组）',
      'worldTags：完整覆盖 worldDescription 中实际成立的氛围标签，去重但不得因固定条数省略',
      'styleGuide.worldviewStyleHint 写在 calibration.styleGuide 内，禁止根级 worldviewStyleHint',
      'calibration.metadata 仅含 essenceTag/civilizationStage/powerSystemTag/spatialForm/difficulty（camelCase 英文 tag，禁止 snake_case）',
      'dimensions.powerCeiling 必须为整数 1-24，禁止字符串',
      'timeline.eraStartYear：若描述含公元年（如 1991年）写入 calibration.timeline.eraStartYear',
      '禁止回写 worldDescription 全文；禁止 markdown 代码块',
      'formulas modifier 默认 1.0，仅输出偏离 ±20% 以上的项',
      '不适用的模拟层 entities 设 { min: 0, max: 0 }',
    ],
    aiDetailedParametersFields: WORLD_CONFIG_AI_FIELD_KEYS.join(', '),
    outputExample: {
      dimensions: {
        powerSystem: '魔法',
        worldviewEssence: '混合',
        civilizationStage: '现代',
        spatialForm: '宇宙',
        powerCeiling: 8,
        worldType: 'mixed',
      },
      calibration: {
        metadata: {
          essenceTag: 'western-fantasy',
          civilizationStage: 'modern',
          powerSystemTag: 'magic',
          spatialForm: 'universe',
          difficulty: 'normal',
        },
        styleGuide: { worldviewStyleHint: '符合 worldDescription 的事件风格一句话' },
        timeline: { eraStartYear: 1991 },
        entities: { settlementCount: { min: 2, max: 8 } },
        formulas: { warFrequencyModifier: 1.2 },
      },
      aiDetailedParameters: {
        climate: '温带',
        averageTemperature: 15,
        techLevel: 5,
        inflationRate: 0.03,
        powerCeiling: 8,
        overallMood: '紧张',
        mysteryLevel: 60,
        note: '其余 43 字段均必填，见 aiDetailedParametersFields',
      },
      worldTags: ['标签1', '标签2', '标签3', '标签4', '标签5'],
    },
    outputFormat: '纯 JSON { dimensions, calibration, aiDetailedParameters, worldTags }',
  }),

  userPromptTemplate: stringifyPrompt({
    worldDescription: '{{worldDescription}}',
    coherenceHint: '{{coherenceHint}}',
    coherenceNote: '{{coherenceNote}}',
    worldType: '{{worldType}}',
    instruction: '推断维度并校准模拟参数，输出合并 JSON',
    worldName: '{{worldName}}',
    essenceTag: '{{essenceTag}}',
    powerSystemTag: '{{powerSystemTag}}',
    spatialForm: '{{spatialForm}}',
    civilizationStage: '{{civilizationStage}}',
    powerCeiling: '{{powerCeiling}}',
    difficulty: '{{difficulty}}',
    dimensionChoices: '{{dimensionChoices}}',
    powerCeilingPresets: '{{powerCeilingPresets}}',
  }),

  variables: [
    'worldName', 'essenceTag', 'powerSystemTag', 'spatialForm',
    'civilizationStage', 'powerCeiling', 'difficulty', 'worldDescription',
    'dimensionChoices', 'powerCeilingPresets',
    'coherenceHint', 'coherenceNote', 'worldType',
  ],

  outputFormat: 'json',
  outputSchema: worldDimensionCalibrationOutputSchema,
}
