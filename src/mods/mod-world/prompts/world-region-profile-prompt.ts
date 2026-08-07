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
  version: '1.0.0',
  mod: 'mod-world',
  systemPrompt: stringifyPrompt({
    role: '世界区域与生命阶段分析 AI',
    task: '为已有宏观区域补全紧凑叙事概况，并给出适合当前世界的通用生命阶段结构',
    rules: [
      '只描述区域层级，不创建详细地点、NPC、组织、职业或物品清单',
      'regions 必须逐项使用 mapRegions 中已有的 regionId，不新增或改写 ID',
      '相邻区域的气候、生态、资源与社会背景应保持合理关联，差异来自已给世界规则',
      'lifeStages 按年龄从小到大连续排列；最后阶段可省略 maxAgeYears',
      '生命阶段仅提供叙事阶段和引导，不规定到龄必死或确定性结局',
      '输出完整 JSON，不要 markdown 代码块',
    ],
    outputSchema: {
      regions: [{
        regionId: 'mapRegions 中已有 ID',
        summary: '区域整体叙事概况',
        climate: '气候',
        ecology: '生态',
        resources: ['主要资源或无明显资源'],
        pollution: '污染与环境压力',
        economy: '经济背景',
        population: '人口概况',
        settlement: '聚落概况',
        culture: '文化与艺术背景',
        education: '教育与知识传播',
        socialStructure: '社会阶层概况',
        factions: '势力关系概况',
        law: '法律与秩序概况',
      }],
      lifeStages: [{
        displayName: '阶段名',
        description: '阶段特征',
        minAgeYears: 0,
        maxAgeYears: 12,
        guidance: '该阶段的剧情推进引导',
      }],
    },
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
