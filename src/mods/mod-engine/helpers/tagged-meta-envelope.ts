/**
 * @module tagged-meta-envelope.ts
 * @description 主叙事 AI 的完整标签信封解析
 * @mod mod-engine
 */

import { unwrapCompleteMarkdownFence } from '@/core/ai-service/parse-ai-json'

import {
  NARRATIVE_BODY_TAG,
  NARRATIVE_BRANCH_TAG,
  NarrativeAIBranchSchema,
  parseNarrativeAIJson,
  type NarrativeAIBranch,
} from './narrative-ai-protocol'

export interface NarrativeResponseEnvelope {
  narrative: string
  branch?: NarrativeAIBranch
}

function normalizeResponse(content: string): string {
  return unwrapCompleteMarkdownFence(content)
}

function collectReservedTags(content: string): string[] {
  return [...content.matchAll(/⟦[^⟧\r\n]+⟧/gu)].map((match) => match[0])
}

function stripPlainNarrativeHeading(content: string): string {
  return content.replace(
    /^(?:#{1,6}[ \t]*)?(?:\*\*)?(?:正文|故事正文)(?:\*\*)?(?:(?:[ \t]*[:：][ \t]*)|(?:[ \t]*\n+))/u,
    '',
  )
}

function isJsonOnly(content: string): boolean {
  const trimmed = content.trim()
  if (!/^\{|^\[/u.test(trimmed) || !/\}$|\]$/u.test(trimmed)) return false
  try {
    parseNarrativeAIJson(trimmed)
    return true
  } catch {
    return false
  }
}

/**
 * 第一次调用以完整正文为最低成功条件；当前正文/分支标签仍可精确分离，
 * 外层围栏、说明前缀、空白和多行分支 JSON 不影响采用。
 */
export function parseNarrativeResponseEnvelope(content: string): NarrativeResponseEnvelope {
  const normalized = normalizeResponse(content)
  if (!normalized) throw new Error('叙事响应缺少完整正文')

  const bodyTags = [...normalized.matchAll(/⟦正文⟧/gu)]
  const branchTags = [...normalized.matchAll(/⟦分支⟧/gu)]
  if (bodyTags.length > 1) throw new Error('叙事响应只能包含一个正文段')
  if (branchTags.length > 1) throw new Error('叙事响应只能包含一个分支段')

  const reservedTags = collectReservedTags(normalized)
  if (reservedTags.some((tag) => tag !== NARRATIVE_BODY_TAG && tag !== NARRATIVE_BRANCH_TAG)) {
    throw new Error('叙事响应包含当前协议无法识别的分段')
  }

  const bodyTag = bodyTags[0]
  const branchTag = branchTags[0]
  const bodyStart = bodyTag ? (bodyTag.index ?? 0) + NARRATIVE_BODY_TAG.length : 0
  const branchStart = branchTag?.index
  if (branchStart !== undefined && branchStart < bodyStart) {
    throw new Error('分支段不能出现在正文之前')
  }

  const rawNarrative = normalized.slice(bodyStart, branchStart ?? normalized.length)
  const narrative = (bodyTag ? rawNarrative : stripPlainNarrativeHeading(rawNarrative)).trim()
  if (!narrative || isJsonOnly(narrative)) throw new Error('叙事响应缺少可识别的完整正文')
  if (collectReservedTags(narrative).length > 0) {
    throw new Error('正文内部不能包含协议分段')
  }

  if (branchStart === undefined) return { narrative }
  const branchSource = normalized.slice(branchStart + NARRATIVE_BRANCH_TAG.length).trim()
  if (!branchSource || collectReservedTags(branchSource).length > 0) {
    throw new Error(`${NARRATIVE_BRANCH_TAG} 后缺少完整分支 JSON`)
  }

  return {
    narrative,
    branch: NarrativeAIBranchSchema.parse(parseNarrativeAIJson(branchSource)),
  }
}

export const SEGMENTED_NARRATIVE_PROTOCOL = {
  body: NARRATIVE_BODY_TAG,
  branch: NARRATIVE_BRANCH_TAG,
} as const
