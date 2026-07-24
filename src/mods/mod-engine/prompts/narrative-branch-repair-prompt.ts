/**
 * @module narrative-branch-repair-prompt.ts
 * @description 玩家强制分支缺失时的独立后台输出契约。
 * @mod mod-engine
 */

import type { PromptTemplate } from '@/foundation'
import type { NarrativeBranchRepairOutput } from '../types'

import { z } from 'zod'

export const NARRATIVE_BRANCH_REPAIR_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-branch-repair:1.0.0'

export const narrativeBranchRepairOutputSchema = z.object({
  分支标题: z.string().trim().min(1),
  分支选项: z.array(z.string().trim().min(1)).min(2).max(4),
}).strict().superRefine((value, ctx) => {
  const normalized = value.分支选项.map((option) => option.trim())
  if (new Set(normalized).size !== normalized.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['分支选项'],
      message: '分支选项不得重复',
    })
  }
})

export const narrativeBranchRepairPrompt: PromptTemplate<NarrativeBranchRepairOutput> = {
  name: 'narrative-branch-repair',
  version: '1.0.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_BRANCH_REPAIR_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '玩家强制分支后台补救只接收已经提交的完整正文。',
  variables: [],
  outputFormat: 'json',
  outputSchema: narrativeBranchRepairOutputSchema,
}
