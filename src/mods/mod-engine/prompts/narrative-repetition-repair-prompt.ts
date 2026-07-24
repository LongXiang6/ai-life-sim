/**
 * @module narrative-repetition-repair-prompt.ts
 * @description 重复正文后台改写与独立事实一致性审计契约。
 * @mod mod-engine
 */

import type { PromptTemplate } from '@/foundation'
import type {
  NarrativeRepetitionAuditOutput,
  NarrativeRepetitionRepairOutput,
} from '../types'
import { z } from 'zod'

import {
  NARRATIVE_BODY_TAG,
  NARRATIVE_DATA_TAG,
  NARRATIVE_END_TAG,
  NARRATIVE_SUMMARY_TAG,
} from '../helpers/narrative-ai-protocol'
import { extractTaggedMetaEnvelope } from '../helpers/tagged-meta-envelope'

export const NARRATIVE_REPETITION_REPAIR_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-repetition-repair:1.0.0'
export const NARRATIVE_REPETITION_AUDIT_SERVER_PROMPT_ASSET_ID =
  'mod-engine:narrative-repetition-audit:1.1.0'

export const narrativeRepetitionAuditOutputSchema = z.object({
  事实一致: z.boolean(),
  完整覆盖: z.boolean(),
  覆盖证据: z.array(z.object({
    原文事实: z.string().trim().min(1),
    候选对应: z.string().trim().min(1),
  }).strict()),
  冲突: z.array(z.string().trim().min(1)),
  遗漏: z.array(z.string().trim().min(1)),
}).strict().superRefine((value, ctx) => {
  if (value.事实一致 && value.冲突.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['冲突'],
      message: '事实一致时冲突必须为空',
    })
  }
  if (!value.事实一致 && value.冲突.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['冲突'],
      message: '事实不一致时必须指出至少一项具体冲突',
    })
  }
  if (value.完整覆盖 && value.遗漏.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['遗漏'],
      message: '完整覆盖时遗漏必须为空',
    })
  }
  if (!value.完整覆盖 && value.遗漏.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['遗漏'],
      message: '未完整覆盖时必须指出至少一项具体遗漏',
    })
  }
  if (value.事实一致 && value.完整覆盖 && value.覆盖证据.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['覆盖证据'],
      message: '接受替换前必须逐项提供原文事实与候选对应证据',
    })
  }
})

/**
 * 只接受 `正文 -> 结束`。摘要、数据区、额外协议分区与协议外文本一律拒绝，
 * 原始已提交正文由调用方继续保留。
 */
export function parseNarrativeRepetitionRepairOutput(
  content: string,
): NarrativeRepetitionRepairOutput | undefined {
  const normalized = content
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/gu, '\n')
    .trim()
  const lines = normalized.split('\n')
  if (lines.length < 3) return undefined
  if (lines[0].trim() !== NARRATIVE_BODY_TAG) return undefined
  if (lines[lines.length - 1].trim() !== NARRATIVE_END_TAG) return undefined

  const protocolMarkers = new Set([
    NARRATIVE_BODY_TAG,
    NARRATIVE_SUMMARY_TAG,
    NARRATIVE_DATA_TAG,
    NARRATIVE_END_TAG,
  ])
  if (lines.slice(1, -1).some((line) => protocolMarkers.has(line.trim()))) return undefined

  const envelope = extractTaggedMetaEnvelope(normalized)
  if (!envelope || envelope.summary !== undefined || envelope.dataPresent) return undefined
  return {
    content,
    narrative: envelope.narrative,
  }
}

/** 异常形状、额外字段和自相矛盾的结论都按审计失败处理。 */
export function parseNarrativeRepetitionAuditOutput(
  value: unknown,
): NarrativeRepetitionAuditOutput | undefined {
  const parsed = narrativeRepetitionAuditOutputSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export const narrativeRepetitionRepairPrompt: PromptTemplate = {
  name: 'narrative-repetition-repair',
  version: '1.0.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_REPETITION_REPAIR_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '重复正文后台改写只接收近期历史、上一版完整输出与重复原因。',
  variables: [],
  outputFormat: 'text',
}

export const narrativeRepetitionAuditPrompt: PromptTemplate<NarrativeRepetitionAuditOutput> = {
  name: 'narrative-repetition-audit',
  version: '1.1.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_REPETITION_AUDIT_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '独立审计上一版、近期历史与改写候选之间的事实一致性。',
  variables: [],
  outputFormat: 'json',
  outputSchema: narrativeRepetitionAuditOutputSchema,
}
