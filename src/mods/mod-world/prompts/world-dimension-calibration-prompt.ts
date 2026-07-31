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
  version: '2.0.0',
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
      powerFramework: { label: '力量框架', description: '为当前世界定义具名阶位、边界描述和有限/开放进阶规则' },
      worldType: {
        label: '世界类型',
        options: ['materialist', 'idealist', 'mixed'],
      },
    },
    dimensionInferenceRules: [
      'worldDescription 为最高优先级',
      'powerFramework 只描述当前世界的真实力量层次；不得套用跨世界固定阶位表',
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
      'powerFramework.ranks 必须按世界观实际需要生成连续阶位；机器 ID 由系统生成，不在 AI 输出中填写',
      'timeline.eraStartYear：若描述含公元年（如 1991年）写入 calibration.timeline.eraStartYear',
      '禁止回写 worldDescription 全文；禁止 markdown 代码块',
      'formulas modifier 默认 1.0，仅输出偏离 ±20% 以上的项',
      'scale 中的大整数全部使用不含逗号的十进制字符串；人口总量以整个上下文而非单个地区为语义，并与文明时代、空间范围和世界描述一致',
      '不适用的模拟层 entities 设 { min: 0, max: 0 }',
    ],
    aiDetailedParametersFields: WORLD_CONFIG_AI_FIELD_KEYS.join(', '),
    outputExample: {
      dimensions: {
        powerSystem: '魔法',
        worldviewEssence: '混合',
        civilizationStage: '现代',
        spatialForm: '宇宙',
        powerFramework: {
          label: '城市魔法阶序',
          progression: 'bounded',
          ranks: [
            { label: '学徒', description: '能够安全完成基础术式' },
            { label: '施法者', description: '能够独立完成稳定法术' },
            { label: '高阶法师', description: '能够影响大型事件' },
          ],
        },
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
        scale: {
          populationTotal: '8200000000',
          populationCarryingCapacity: '12000000000',
          annualEconomicOutput: '147600000000000',
          moneySupply: '110000000000000',
          monetaryMode: 'currency',
        },
        formulas: { warFrequencyModifier: 1.2 },
      },
      aiDetailedParameters: {
        climate: '温带',
        averageTemperature: 15,
        techLevel: 5,
        inflationRate: 0.03,
        powerHierarchyComplexity: 40,
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
    powerFramework: '{{powerFramework}}',
    difficulty: '{{difficulty}}',
    dimensionChoices: '{{dimensionChoices}}',
  }),

  variables: [
    'worldName', 'essenceTag', 'powerSystemTag', 'spatialForm',
    'civilizationStage', 'powerFramework', 'difficulty', 'worldDescription',
    'dimensionChoices',
    'coherenceHint', 'coherenceNote', 'worldType',
  ],

  outputFormat: 'json',
  outputSchema: worldDimensionCalibrationOutputSchema,
}
