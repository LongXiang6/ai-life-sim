/**
 * @module world-entity-prompt.ts
 * @description W06 具名实体 AI 生成 Prompt（v1.3：KV 共享 system + 稳定 user 前置）
 * @mod mod-world
 */

import type { PromptTemplate } from '@/foundation'
import { stringifyPrompt } from '@/foundation'

import { z } from 'zod'

import { worldEntityGeneratorSystemPrompt } from './world-init-prompt-shared'

export const worldEntityOutputSchema = z.unknown()

export const worldEntityPrompt: PromptTemplate = {
  name: 'world-entity',
  version: '1.4.0',
  mod: 'mod-world',

  systemPrompt: worldEntityGeneratorSystemPrompt,

  userPromptTemplate: stringifyPrompt({
    worldDescription: '{{worldDescription}}',
    coherenceHint: '{{coherenceHint}}',
    coherenceNote: '{{coherenceNote}}',
    worldName: '{{worldName}}',
    essenceTag: '{{essenceTag}}',
    powerSystemTag: '{{powerSystemTag}}',
    civilizationStage: '{{civilizationStage}}',
    spatialForm: '{{spatialForm}}',
    worldType: '{{worldType}}',
    worldTags: '{{worldTags}}',
    calibrationSummary: '{{calibrationSummary}}',
    instruction: '请分析以下世界并生成具名实体（不适用层返回 []）',
    entityRanges: '{{entityRanges}}',
    mapRegions: '{{mapRegions}}',
    existingEntities: '{{existingEntities}}',
  }),

  variables: [
    'worldName', 'essenceTag', 'powerSystemTag', 'civilizationStage', 'spatialForm',
    'worldDescription', 'worldTags', 'calibrationSummary', 'entityRanges', 'mapRegions',
    'coherenceHint', 'coherenceNote', 'worldType', 'existingEntities',
  ],

  outputFormat: 'json',
  outputSchema: worldEntityOutputSchema,
}
