/**
 * Purpose: Define the existing world-init enrichment call for region profiles and life-stage structure.
 * Owner: mod-world / world-init.
 * Responsibility: Prompt and output Schema only; parsing and Store commits stay outside.
 */

import { stringifyPrompt, type PromptTemplate } from '@/foundation'
import { z } from 'zod'

const regionProfileSchema = z.object({
  regionId: z.string().min(1),
  summary: z.string().min(1),
  climate: z.string().min(1),
  ecology: z.string().min(1),
  resources: z.array(z.string().min(1)),
  pollution: z.string().min(1),
  economy: z.string().min(1),
  population: z.string().min(1),
  settlement: z.string().min(1),
  culture: z.string().min(1),
  education: z.string().min(1),
  socialStructure: z.string().min(1),
  factions: z.string().min(1),
  law: z.string().min(1),
}).strict()

const lifeStageSchema = z.object({
  displayName: z.string().min(1),
  description: z.string().min(1),
  minAgeYears: z.number().int().nonnegative(),
  maxAgeYears: z.number().int().positive().optional(),
  guidance: z.string().min(1),
}).strict()

export const worldRegionProfileOutputSchema = z.object({
  regions: z.array(regionProfileSchema),
  lifeStages: z.array(lifeStageSchema).min(2),
}).strict()

export type WorldRegionProfileOutput = z.infer<typeof worldRegionProfileOutputSchema>

export const worldRegionProfilePrompt: PromptTemplate = {
  name: 'world-region-profile',
  version: '1.1.0',
  mod: 'mod-world',
  systemPrompt: stringifyPrompt({
    role: '世界区域与生命阶段专员',
    responsibilities: {
      regions: '只为 mapRegions 中已有区域补全区域层级的自然、资源、人口、聚落、文化、教育、社会、势力与秩序概况。',
      lifeStages: '只建立适合当前世界生命形态的连续年龄阶段与叙事引导。',
    },
    sharedRules: [
      'regions 逐项沿用 mapRegions 的稳定 regionId；区域差异与相互关联都从输入世界事实中形成。',
      '区域概况保持宏观尺度，每个字段描述该区域对应的一类背景。',
      'lifeStages 按 minAgeYears 递增并连续衔接，最后阶段可以省略 maxAgeYears。',
      '生命阶段描述成长与生活阶段，角色的实际结局继续由故事事实决定。',
    ],
    output: '纯 JSON 对象，根字段为 regions 与 lifeStages。',
  }),
  userPromptTemplate: stringifyPrompt({
    worldName: '{{worldName}}',
    worldDescription: '{{worldDescription}}',
    essenceTag: '{{essenceTag}}',
    powerSystemTag: '{{powerSystemTag}}',
    civilizationStage: '{{civilizationStage}}',
    spatialForm: '{{spatialForm}}',
    worldType: '{{worldType}}',
    worldTags: '{{worldTags}}',
    calibrationSummary: '{{calibrationSummary}}',
    mapRegions: '{{mapRegions}}',
  }),
  variables: [
    'worldName',
    'worldDescription',
    'essenceTag',
    'powerSystemTag',
    'civilizationStage',
    'spatialForm',
    'worldType',
    'worldTags',
    'calibrationSummary',
    'mapRegions',
  ],
  outputFormat: 'json',
  outputSchema: worldRegionProfileOutputSchema,
}
