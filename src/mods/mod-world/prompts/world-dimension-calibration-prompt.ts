/**
 * Purpose: Compose the main world-initialization Prompt from separately owned output responsibilities.
 * Owner: mod-world / world-init.
 * Responsibility: Dimension inference and cross-section consistency only; calibration, detailed parameters, and tags keep their own contracts.
 */

import { z } from 'zod'

import { stringifyPrompt, type PromptTemplate } from '@/foundation'

import { dimensionInferenceOutputSchema } from './dimension-inference-schema'
import {
  WORLD_CALIBRATION_PROMPT_CONTRACT,
  worldCalibrationOutputSchema,
} from './world-calibration-prompt'
import {
  WORLD_CONFIG_PARAMETER_CATALOG,
  WORLD_CONFIG_PROMPT_CONTRACT,
  worldConfigOutputSchema,
} from './world-config-prompt'
import { WORLD_TAGS_PROMPT_CONTRACT, worldTagsOutputSchema } from './world-tags-prompt'

export const worldDimensionCalibrationOutputSchema = z.object({
  dimensions: dimensionInferenceOutputSchema,
  calibration: worldCalibrationOutputSchema,
  aiDetailedParameters: worldConfigOutputSchema,
  worldTags: worldTagsOutputSchema.shape.tags,
})

export type WorldDimensionCalibrationOutput = z.infer<typeof worldDimensionCalibrationOutputSchema>

export const WORLD_DIMENSION_PROMPT_CONTRACT = {
  responsibility: '只根据世界描述与 dimensionChoices 确定当前世界的五项框架维度及 worldType。',
  fields: {
    powerSystem: '力量体系，从无、修仙、魔法、灵能、科技、异能、混合中选择。',
    worldviewEssence: '世界观本质，从唯物主义、唯心主义、唯物修仙、唯心修仙、混合中选择。',
    civilizationStage: '文明阶段，从原始、古代、中世纪、近代、现代、未来中选择。',
    spatialForm: '空间形态，从位面、宇宙、位面晶壁群系、多元宇宙群系、诸天万界中选择。',
    powerFramework: '当前世界具名力量层次、进阶边界与连续阶位。',
    worldType: '世界类型，从 materialist、idealist、mixed 中选择。',
  },
  rules: [
    'worldDescription 提供世界真实规律，dimensionChoices 提供每项维度的决定权。',
    'adaptive 与 custom 使用玩家已经选定的值，AI 决定的维度根据世界事实推断。',
    'powerFramework 只描述当前世界已有的力量层次，阶位名称、边界与进阶方式彼此连续。',
  ],
  output: 'dimensions 只包含五项框架维度与 worldType 的推断结果。',
} as const

export const worldDimensionCalibrationPrompt: PromptTemplate = {
  name: 'world-dimension-calibration',
  version: '2.4.0',
  mod: 'mod-world',
  systemPrompt: stringifyPrompt({
    role: '世界初始化协调器',
    responsibilities: {
      dimensions: WORLD_DIMENSION_PROMPT_CONTRACT,
      calibration: WORLD_CALIBRATION_PROMPT_CONTRACT,
      aiDetailedParameters: {
        ...WORLD_CONFIG_PROMPT_CONTRACT,
        fields: WORLD_CONFIG_PARAMETER_CATALOG,
      },
      worldTags: WORLD_TAGS_PROMPT_CONTRACT,
    },
    coordination: [
      '按 dimensions、calibration、aiDetailedParameters、worldTags 四个顶层字段返回结果。',
      '四个区域读取同一份世界事实，各自只填写所属字段。',
      'calibration.metadata 与 dimensions 使用同一组最终维度，数值尺度与详细参数保持一致。',
    ],
  }),
  userPromptTemplate: stringifyPrompt({
    worldDescription: '{{worldDescription}}',
    coherenceHint: '{{coherenceHint}}',
    coherenceNote: '{{coherenceNote}}',
    worldType: '{{worldType}}',
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
