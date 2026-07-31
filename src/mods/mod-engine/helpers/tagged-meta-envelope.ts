/**
 * @module tagged-meta-envelope.ts
 * @description 两次 AI 调用的完整内容分段解析
 * @mod mod-engine
 */

import { unwrapCompleteMarkdownFence } from '@/core/ai-service/parse-ai-json'

import {
  NARRATIVE_BODY_TAG,
  NARRATIVE_BRANCH_TAG,
  NARRATIVE_DATA_TAG,
  NARRATIVE_EVENT_CANDIDATES_TAG,
  NarrativeAIBranchSchema,
  NarrativeAIEventRecognitionDataSchema,
  NarrativeAISettlementDataSchema,
  NarrativeAISystemInstructionSchema,
  parseNarrativeAIJson,
  type NarrativeAIBranch,
  type NarrativeAIEventRecognitionData,
  type NarrativeAISettlementData,
  type NarrativeAISystemInstruction,
} from './narrative-ai-protocol'

export interface NarrativeResponseEnvelope {
  narrative: string
  branch?: NarrativeAIBranch
}

export interface NarrativeSettlementEnvelope {
  systemInstructions: NarrativeAISystemInstruction[]
  data: NarrativeAISettlementData
}

export interface NarrativeEventRecognitionEnvelope {
  data: NarrativeAIEventRecognitionData
}

interface SettlementTag {
  index: number
  end: number
  kind: 'system' | 'data'
  number?: number
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

function collectSettlementTags(content: string): SettlementTag[] {
  const tags: SettlementTag[] = []
  const pattern = /⟦(?:系统([1-9]\d*)|数据)⟧/gu
  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0
    tags.push({
      index,
      end: index + match[0].length,
      kind: match[1] ? 'system' : 'data',
      ...(match[1] ? { number: Number(match[1]) } : {}),
    })
  }
  return tags
}

/**
 * 第二次调用按当前标签识别完整 JSON；换行、空行、围栏和说明文字可变，
 * 连续系统编号、唯一末尾数据段及全部 Schema 仍保持严格。
 */
export function parseNarrativeSettlementEnvelope(content: string): NarrativeSettlementEnvelope {
  const normalized = normalizeResponse(content)
  if (!normalized) throw new Error('结算响应不能为空')

  const knownTags = collectSettlementTags(normalized)
  const reservedTags = collectReservedTags(normalized)
  if (reservedTags.length !== knownTags.length) {
    throw new Error('结算响应包含当前协议无法识别的分段')
  }
  if (knownTags.length === 0) throw new Error(`结算响应缺少 ${NARRATIVE_DATA_TAG} 数据段`)

  const systemInstructions: NarrativeAISystemInstruction[] = []
  let data: NarrativeAISettlementData | undefined

  for (const [index, tag] of knownTags.entries()) {
    const nextTag = knownTags[index + 1]
    const source = normalized.slice(tag.end, nextTag?.index ?? normalized.length).trim()
    if (!source) throw new Error(`${tag.kind === 'data' ? '数据' : `系统${tag.number}`}段缺少完整 JSON`)

    if (tag.kind === 'system') {
      if (data) throw new Error('系统操作不能出现在数据段之后')
      const expectedNumber = systemInstructions.length + 1
      if (tag.number !== expectedNumber) {
        throw new Error(`系统段编号必须从 1 连续递增，当前位置应为系统${expectedNumber}`)
      }
      systemInstructions.push(
        NarrativeAISystemInstructionSchema.parse(parseNarrativeAIJson(source)),
      )
      continue
    }

    if (data) throw new Error('结算响应只能包含一个数据段')
    if (index !== knownTags.length - 1) throw new Error('数据段必须是结算响应的最后一段')
    data = NarrativeAISettlementDataSchema.parse(parseNarrativeAIJson(source))
  }

  if (!data) throw new Error(`结算响应缺少 ${NARRATIVE_DATA_TAG} 数据段`)
  return { systemInstructions, data }
}

/** 事件识别调用只接受唯一待触发事件段及其完整 JSON。 */
export function parseNarrativeEventRecognitionEnvelope(
  content: string,
): NarrativeEventRecognitionEnvelope {
  const normalized = normalizeResponse(content)
  if (!normalized) throw new Error('事件识别响应不能为空')

  const tags = [...normalized.matchAll(/⟦待触发事件⟧/gu)]
  if (tags.length !== 1) {
    throw new Error(`事件识别响应必须包含唯一 ${NARRATIVE_EVENT_CANDIDATES_TAG} 分段`)
  }
  const reservedTags = collectReservedTags(normalized)
  if (reservedTags.length !== 1 || reservedTags[0] !== NARRATIVE_EVENT_CANDIDATES_TAG) {
    throw new Error('事件识别响应包含当前协议无法识别的分段')
  }

  const tag = tags[0]
  const source = normalized.slice((tag.index ?? 0) + NARRATIVE_EVENT_CANDIDATES_TAG.length).trim()
  if (!source) throw new Error(`${NARRATIVE_EVENT_CANDIDATES_TAG} 后缺少完整 JSON`)
  return {
    data: NarrativeAIEventRecognitionDataSchema.parse(parseNarrativeAIJson(source)),
  }
}

export const SEGMENTED_NARRATIVE_PROTOCOL = {
  body: NARRATIVE_BODY_TAG,
  branch: NARRATIVE_BRANCH_TAG,
  systemPrefix: '⟦系统N⟧',
  data: NARRATIVE_DATA_TAG,
  eventCandidates: NARRATIVE_EVENT_CANDIDATES_TAG,
} as const
