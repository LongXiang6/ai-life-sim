/**
 * @module world-timeline-prompt.ts
 * @description W05 世界时间线 AI 填充 Prompt（v3.3：KV 共享 system + 稳定 user 前置）
 * @mod mod-world
 */

import type { PromptTemplate } from '@/foundation'
import { stringifyPrompt } from '@/foundation'

import { z } from 'zod'

import { worldEventNarratorSystemPrompt } from './world-init-prompt-shared'

export const worldTimelineOutputSchema = z.unknown()

export const worldTimelinePrompt: PromptTemplate = {
  name: 'world-timeline',
  version: '3.3.0',
  mod: 'mod-world',

  systemPrompt: worldEventNarratorSystemPrompt,

  userPromptTemplate: stringifyPrompt({
    taskMode: 'future',
    worldDescription: '{{worldDescription}}',
    coherenceHint: '{{coherenceHint}}',
    coherenceNote: '{{coherenceNote}}',
    worldName: '{{worldName}}',
    essenceTag: '{{essenceTag}}',
    civilizationStage: '{{civilizationStage}}',
    worldType: '{{worldType}}',
    worldviewStyleHint: '{{worldviewStyleHint}}',
    instruction: '请根据世界设定生成未来时间线事件（创世后即将发生，非历史回溯）',
    requirements: [
      '每个事件必须匹配 skeletonEvents 中的年份与影响级别',
      'involvedFactions 仅填本世界真实组织；无则 []',
      '严格按影响级别写作，现代白话',
    ],
    stageIndex: '{{stageIndex}}',
    stageSpan: '{{stageSpan}}',
    stageStartYear: '{{stageStartYear}}',
    stageEndYear: '{{stageEndYear}}',
    previousStageSummary: '{{previousStageSummary}}',
    skeletonEvents: '{{skeletonEvents}}',
    outputInstruction: '紧凑 JSON 数组，每个元素一行，按 skeletonEvents 顺序',
  }),

  variables: [
    'worldName', 'essenceTag', 'powerSystemTag', 'civilizationStage', 'worldDescription',
    'coherenceHint', 'coherenceNote', 'worldType', 'stageIndex', 'stageSpan', 'stageStartYear', 'stageEndYear',
    'previousStageSummary', 'skeletonEvents', 'worldviewStyleHint',
  ],

  outputFormat: 'json',
  outputSchema: worldTimelineOutputSchema,
}
