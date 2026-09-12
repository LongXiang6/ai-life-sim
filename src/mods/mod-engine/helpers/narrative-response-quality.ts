/**
 * Purpose: Validate the approved 01/02/03 AI responses before their owners consume them.
 * Owner: mod-engine
 * Responsibility: Parse protocols and classify response quality only.
 */

import type { NarrativeWordCountTarget } from '@/foundation'
import { resolveNarrativeWordCountRange } from '../constants/narrative-config'
import {
  NarrativeAIStoryContinuityDataSchema,
  NarrativeAITalentGrowthDataSchema,
  parseNarrativeAIJson,
  type NarrativeAIStoryContinuityData,
  type NarrativeAITalentGrowthData,
} from './narrative-ai-protocol'
import {
  narrativeParser,
  type ParsedNarrative,
} from '../subsystems/narrative-parser-system'
import {
  calculateNarrativeRepetitionMetric,
  type NarrativeRepetitionMetric,
} from './narrative-repetition-metrics'

export interface NarrativeResponseQuality {
  valid: boolean
  reason: string
  parsed?: ParsedNarrative
  narrativeChars: number
  paragraphCount: number
  lengthAdvisory?: string
  repetitionMetric?: NarrativeRepetitionMetric
}

export interface NarrativeTalentGrowthQuality {
  valid: boolean
  reason: string
  result?: NarrativeAITalentGrowthData
}

export interface NarrativeStoryContinuityQuality {
  valid: boolean
  reason: string
  result?: NarrativeAIStoryContinuityData
  futureEventReason?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

type LooseRecord = Record<string, unknown>

function asRecord(value: unknown): LooseRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : undefined
}

function asText(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim()
    return text || undefined
  }
  return undefined
}

function boundedText(value: unknown, maxLength: number, fallback?: string): string | undefined {
  const text = asText(value)
  if (!text) return fallback
  return text.slice(0, maxLength)
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.values(value as LooseRecord)
  return []
}

function pick(record: LooseRecord | undefined, keys: readonly string[]): unknown {
  if (!record) return undefined
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key]
  }
  return undefined
}

function asInteger(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[，,]/gu, ''))
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  const text = asText(value)?.toLocaleLowerCase()
  if (!text) return undefined
  if (['true', '1', '是', '需要', '成长', 'yes'].includes(text)) return true
  if (['false', '0', '否', '不需要', '不成长', 'no'].includes(text)) return false
  return undefined
}

function normalizeRouteName(value: unknown): '深度强化' | '广度强化' | '转变强化' | undefined {
  const text = asText(value)?.replace(/\s+/gu, '')
  if (!text) return undefined
  if (/深|纵向|同路更深|deep/iu.test(text)) return '深度强化'
  if (/广|横向|同路更宽|wide/iu.test(text)) return '广度强化'
  if (/转|变|质变|方式|transform/iu.test(text)) return '转变强化'
  return undefined
}

function normalizeAttributeBonus(value: unknown): Record<string, number> {
  if (Array.isArray(value)) {
    const merged: Record<string, number> = {}
    for (const item of value) {
      const normalized = normalizeAttributeBonus(item)
      for (const [key, amount] of Object.entries(normalized)) merged[key] = (merged[key] ?? 0) + amount
    }
    return merged
  }
  const source = asRecord(value)
  if (!source && typeof value !== 'string') return {}
  const aliases: Record<string, string> = {
    体质: '体魄', 力量: '体魄', physique: '体魄',
    智力: '心智', 精神: '心智', mind: '心智',
    魅力值: '魅力', charisma: '魅力',
    家庭: '家境', 出身: '家境', 资源: '家境', familybackground: '家境',
    幸运: '气运', 运气: '气运', luck: '气运',
  }
  const output: Record<string, number> = {}
  if (source) {
    for (const [key, raw] of Object.entries(source)) {
      const normalized = aliases[key.trim().toLocaleLowerCase()] ?? key.trim()
      if (!['心智', '体魄', '魅力', '家境', '气运'].includes(normalized)) continue
      output[normalized] = asInteger(raw, 0)
    }
    return output
  }
  const text = String(value)
  const pattern = /(体魄|体质|力量|心智|智力|精神|魅力|魅力值|家境|家庭|出身|资源|气运|幸运|运气|physique|mind|charisma|familybackground|luck)\s*[:：=]?\s*([+-]?\d+)/giu
  for (const match of text.matchAll(pattern)) {
    const normalized = aliases[match[1]!.trim().toLocaleLowerCase()]
      ?? ({ 体魄: '体魄', 体质: '体魄', 力量: '体魄', 心智: '心智', 智力: '心智', 精神: '心智', 魅力: '魅力', 魅力值: '魅力', 家境: '家境', 家庭: '家境', 出身: '家境', 资源: '家境', 气运: '气运', 幸运: '气运', 运气: '气运' } as Record<string, string>)[match[1]!.trim()]
    if (!normalized) continue
    output[normalized] = (output[normalized] ?? 0) + asInteger(match[2], 0)
  }
  return output
}

function extractCurrentNarrativeAttributes(
  promptInput: string | undefined,
): Partial<Record<'心智' | '体魄' | '魅力' | '家境', number>> | undefined {
  if (!promptInput?.trim()) return undefined
  try {
    const payload = JSON.parse(promptInput) as unknown
    if (!Array.isArray(payload)) return undefined
    const container = payload.find((item) => asRecord(item)?.玩家属性 !== undefined)
    const attributes = asRecord(asRecord(container)?.玩家属性)
    if (!attributes) return undefined
    const result: Partial<Record<'心智' | '体魄' | '魅力' | '家境', number>> = {}
    for (const key of ['心智', '体魄', '魅力', '家境'] as const) {
      const numeric = Number(attributes[key])
      if (Number.isFinite(numeric)) result[key] = Math.trunc(numeric)
    }
    return Object.keys(result).length > 0 ? result : undefined
  } catch {
    return undefined
  }
}

/** The first call validates only the story body and optional terminal result. */
export function inspectNarrativeResponseQuality(
  content: string,
  wordCountTarget: NarrativeWordCountTarget,
  repetitionContext?: {
    round: number
    recentHistory: readonly { round: number; text: string }[]
  },
  terminalGuidance?: string,
): NarrativeResponseQuality {
  try {
    const parsed = narrativeParser.parse(content, {
      terminalGuidance,
      currentAttributes: extractCurrentNarrativeAttributes(terminalGuidance),
    })
    const narrativeChars = parsed.narrative.replace(/\s/gu, '').length
    const paragraphCount = parsed.narrative.split(/\n\s*\n/u).filter(Boolean).length
    const { target, preferredMin, preferredMax } = resolveNarrativeWordCountRange(wordCountTarget)
    const lengthAdvisory = narrativeChars < preferredMin || narrativeChars > preferredMax
      ? `正文约 ${narrativeChars} 字，玩家偏好约 ${target} 字（参考区间 ${preferredMin}-${preferredMax} 字）；完整剧情优先，不因字数偏离重写。`
      : undefined
    const repetitionMetric = repetitionContext
      ? calculateNarrativeRepetitionMetric({
          round: repetitionContext.round,
          text: parsed.narrative,
          recentHistory: repetitionContext.recentHistory,
          windowSize: 5,
        })
      : undefined
    return {
      valid: true,
      reason: repetitionMetric?.qualityLevel === 'high'
        ? '正文重复度较高，保留正文并记录诊断，不阻断玩家回合。'
        : '',
      parsed,
      narrativeChars,
      paragraphCount,
      ...(repetitionMetric ? { repetitionMetric } : {}),
      ...(lengthAdvisory ? { lengthAdvisory } : {}),
    }
  } catch (error) {
    return {
      valid: false,
      reason: errorMessage(error),
      narrativeChars: 0,
      paragraphCount: 0,
    }
  }
}

export function inspectNarrativeTalentGrowthQuality(content: string): NarrativeTalentGrowthQuality {
  try {
    const raw = asRecord(parseNarrativeAIJson(content))
    if (!raw) throw new Error('天赋成长响应不是对象')
    const decision = asRecord(pick(raw, ['成长判定', '成长判断', '判定'])) ?? raw
    const needsGrowth = asBoolean(pick(decision, ['需要成长', '是否成长', '成长'])) ?? false
    if (!needsGrowth) return { valid: true, reason: '', result: { 成长判定: { 需要成长: false } } }

    const lineageId = asText(pick(decision, ['命格血脉编号', '命格编号', '血脉编号', '编号']))
      ?? asText(pick(raw, ['命格血脉编号', '命格编号', '血脉编号', '编号']))
    if (!lineageId) throw new Error('成长结果缺少可识别的命格血脉编号')
    const growthEvidence = boundedText(
      pick(decision, ['成长依据', '成长证据', '依据']),
      300,
      '已根据当前回合直接事实判定成长。',
    )!
    const evidenceWindowIds = asArray(pick(decision, ['依据窗口编号', '证据窗口编号', '依据窗口', 'evidenceWindowIds']))
      .map((value) => asText(value))
      .filter((value): value is string => Boolean(value))
    if (evidenceWindowIds.length === 0) throw new Error('成长结果缺少依据窗口编号')
    const routeValues = asArray(pick(decision, ['下一阶方向', '成长路线', '路线', '方向']))
    if (routeValues.length < 3) throw new Error('成长结果缺少三条可供选择的路线')
    const requiredRoutes: Array<'深度强化' | '广度强化' | '转变强化'> = ['深度强化', '广度强化', '转变强化']
    const normalizedRoutes = routeValues.slice(0, 8).map((value, index) => {
      const item = asRecord(value) ?? {}
      const route = normalizeRouteName(pick(item, ['路线', '方向', '类型', 'route']))
        ?? (routeValues.length === 3 ? requiredRoutes[index] : undefined)
      if (!route) return undefined
      const name = boundedText(pick(item, ['名称', '标题', 'name']), 6, route) ?? route
      const detail = boundedText(
        pick(item, ['详细介绍', '介绍', '说明', 'description']),
        300,
        boundedText(pick(item, ['效果描述', '效果', 'effect']), 300, '未提供具体描述。'),
      ) ?? '未提供具体描述。'
      const effect = boundedText(pick(item, ['效果描述', '效果', 'effect']), 300, detail) ?? detail
      return {
        路线: route,
        名称: name,
        详细介绍: detail,
        效果描述: effect,
        属性加成: normalizeAttributeBonus(pick(item, ['属性加成', '属性', '加成', 'attributeBonus'])),
      }
    }).filter((value): value is NonNullable<typeof value> => Boolean(value))
    const byRoute = new Map(normalizedRoutes.map((route) => [route.路线, route]))
    if (byRoute.size !== 3) throw new Error('成长结果无法完整识别三条不同路线')
    const result = NarrativeAITalentGrowthDataSchema.parse({
      成长判定: {
        需要成长: true,
        命格血脉编号: lineageId,
        成长依据: growthEvidence,
        依据窗口编号: evidenceWindowIds,
        下一阶方向: requiredRoutes.map((route) => byRoute.get(route)!),
      },
    })
    return { valid: true, reason: '', result }
  } catch (error) {
    return { valid: false, reason: errorMessage(error) }
  }
}

export function inspectNarrativeStoryContinuityQuality(
  content: string,
  _fallbackTime = '当前时间',
  sourceRounds: readonly number[] = [],
): NarrativeStoryContinuityQuality {
  try {
    const envelope = asRecord(parseNarrativeAIJson(content))
    if (!envelope) throw new Error('故事连续性响应不是对象')
    const rawMemory = envelope.本轮剧情
    if (!Array.isArray(rawMemory)) throw new Error('本轮剧情必须是数组')
    const memory: Array<{ 来源回合?: number; 时间: string; 剧情: string; 权重: number }> = []
    const memoryErrors: string[] = []
    for (const [index, value] of rawMemory.entries()) {
      const item = asRecord(value)
      const sourceRound = item?.来源回合
      const time = typeof item?.时间 === 'string' ? item.时间.trim() : ''
      const plot = typeof item?.剧情 === 'string' ? item.剧情.trim() : ''
      const weight = item?.权重
      if (
        !time
        || !plot
        || (sourceRounds.length > 1 && (
          typeof sourceRound !== 'number'
          || !Number.isInteger(sourceRound)
          || !sourceRounds.includes(sourceRound)
        ))
        || typeof weight !== 'number'
        || !Number.isInteger(weight)
        || weight < 2
        || weight > 10
      ) {
        memoryErrors.push(`本轮剧情[${index}]字段不完整`)
        continue
      }
      memory.push({
        ...(typeof sourceRound === 'number' ? { 来源回合: sourceRound } : {}),
        时间: time,
        剧情: plot,
        权重: weight,
      })
    }
    if (sourceRounds.length > 1 && memoryErrors.length > 0) {
      throw new Error('批量故事连续性结果的每条剧情都必须标明有效的来源回合')
    }

    const futureEvents: string[] = []
    const futureErrors: string[] = []
    const seenFutureEvents = new Set<string>()
    const rawFutureEvents = envelope.未来事件
    if (!Array.isArray(rawFutureEvents)) throw new Error('未来事件必须是数组')
    for (const [index, value] of rawFutureEvents.entries()) {
      const normalized = asText(value)
      const separator = normalized?.search(/[：:]/u) ?? -1
      if (!normalized || separator <= 0 || separator >= normalized.length - 1) {
        futureErrors.push(`未来事件[${index}]无法识别`)
        continue
      }
      const canonical = `${normalized.slice(0, separator).trim()}：${normalized.slice(separator + 1).trim()}`
      if (seenFutureEvents.has(canonical)) continue
      seenFutureEvents.add(canonical)
      futureEvents.push(canonical)
    }
    const result = NarrativeAIStoryContinuityDataSchema.parse({ 本轮剧情: memory, 未来事件: futureEvents })
    return {
      valid: true,
      reason: [...memoryErrors, ...futureErrors].join('；'),
      result,
      ...(futureErrors.length > 0 ? { futureEventReason: futureErrors.join('；') } : {}),
    }
  } catch (error) {
    return { valid: false, reason: errorMessage(error) }
  }
}
