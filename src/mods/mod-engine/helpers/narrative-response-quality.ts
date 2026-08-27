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
  NarrativeAIWorldSimulationResultSchema,
  parseNarrativeAIJson,
  type NarrativeAIStoryContinuityData,
  type NarrativeAITalentGrowthData,
  type NarrativeAIWorldSimulationResult,
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

export interface NarrativeWorldSimulationQuality {
  valid: boolean
  reason: string
  result?: NarrativeAIWorldSimulationResult
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
    天赋: '悟性', 学习: '悟性', aptitude: '悟性',
    魅力值: '魅力', charisma: '魅力',
    幸运: '气运', 运气: '气运', luck: '气运',
  }
  const output: Record<string, number> = {}
  if (source) {
    for (const [key, raw] of Object.entries(source)) {
      const normalized = aliases[key.trim().toLocaleLowerCase()] ?? key.trim()
      if (!['体魄', '心智', '悟性', '魅力', '气运'].includes(normalized)) continue
      output[normalized] = asInteger(raw, 0)
    }
    return output
  }
  const text = String(value)
  const pattern = /(体魄|体质|力量|心智|智力|精神|悟性|天赋|学习|魅力|魅力值|气运|幸运|运气|physique|mind|aptitude|talent|charisma|luck)\s*[:：=]?\s*([+-]?\d+)/giu
  for (const match of text.matchAll(pattern)) {
    const normalized = aliases[match[1]!.trim().toLocaleLowerCase()]
      ?? ({ 体魄: '体魄', 体质: '体魄', 力量: '体魄', 心智: '心智', 智力: '心智', 精神: '心智', 悟性: '悟性', 天赋: '悟性', 学习: '悟性', 魅力: '魅力', 魅力值: '魅力', 气运: '气运', 幸运: '气运', 运气: '气运' } as Record<string, string>)[match[1]!.trim()]
    if (!normalized) continue
    output[normalized] = (output[normalized] ?? 0) + asInteger(match[2], 0)
  }
  return output
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
    const parsed = narrativeParser.parse(content, { terminalGuidance })
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
  fallbackTime = '当前时间',
): NarrativeStoryContinuityQuality {
  try {
    const envelope = asRecord(parseNarrativeAIJson(content))
    if (!envelope) throw new Error('故事连续性响应不是对象')
    const rawMemory = asArray(pick(envelope, ['本轮记忆', '本回合记忆', '记忆', 'memory']))
    const memory: Array<{ 时间: string; 事实: string; 权重: number }> = []
    const memoryErrors: string[] = []
    for (const [index, value] of rawMemory.entries()) {
      const item = asRecord(value)
      const fact = boundedText(item ? pick(item, ['事实', '内容', '事件', '记忆', 'text']) : value, 1000)
      if (!fact) { memoryErrors.push(`本轮记忆[${index}]无法识别`); continue }
      const time = boundedText(item ? pick(item, ['时间', '日期', '发生时间', '发生日期']) : undefined, 120, fallbackTime) ?? fallbackTime
      const weight = Math.min(10, Math.max(2, asInteger(item ? pick(item, ['权重', '重要度', 'weight']) : undefined, 5)))
      memory.push({ 时间: time, 事实: fact, 权重: weight })
    }

    const futureEvents: string[] = []
    const futureErrors: string[] = []
    const seenFutureEvents = new Set<string>()
    for (const [index, value] of asArray(pick(envelope, ['未来事件', '未来事项', 'futureEvents'])).entries()) {
      const item = asRecord(value)
      const time = boundedText(item ? pick(item, ['时间', '日期', '发生时间', 'dueTime']) : undefined, 120)
      const fact = boundedText(item ? pick(item, ['事实', '事件', '事项', '内容', '描述', 'event']) : value, 1000)
      let normalized = fact
      if (fact && !time) {
        const separator = fact.search(/[：:]/u)
        if (separator > 0) normalized = `${fact.slice(0, separator).trim()}：${fact.slice(separator + 1).trim()}`
      } else if (time && fact) normalized = `${time}：${fact}`
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
    const result = NarrativeAIStoryContinuityDataSchema.parse({ 本轮记忆: memory, 未来事件: futureEvents })
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

const WORLD_CATEGORY_TO_LABEL: Record<string, string> = {
  环境: '环境', environment: '环境',
  社会: '社会', social: '社会',
  经济: '经济', economic: '经济',
  政治: '政治', political: '政治',
  生态: '生态', ecological: '生态',
  技术: '技术', technology: '技术',
  迁徙: '迁徙', migration: '迁徙',
  发现: '发现', discovery: '发现',
  风险: '风险', hazard: '风险',
  机遇: '机遇', opportunity: '机遇',
}

const WORLD_INTENSITY_TO_LABEL: Record<string, string> = {
  轻微: '轻微', minor: '轻微',
  中等: '中等', moderate: '中等',
  重大: '重大', major: '重大',
}

const WORLD_PROFILE_FIELD_TO_LABEL: Record<string, string> = {
  概况: '概况', summary: '概况',
  气候: '气候', climate: '气候',
  生态: '生态', ecology: '生态',
  污染: '污染', pollution: '污染',
  经济: '经济', economy: '经济',
  人口: '人口', population: '人口',
  聚落: '聚落', settlement: '聚落',
  文化: '文化', culture: '文化',
  教育: '教育', education: '教育',
  社会结构: '社会结构', socialStructure: '社会结构',
  势力: '势力', factions: '势力',
  法律: '法律', law: '法律',
}

function normalizeWorldEnum(value: unknown, map: Record<string, string>): string | undefined {
  const raw = asText(value)
  if (!raw) return undefined
  return map[raw.trim()] ?? map[raw.trim().toLocaleLowerCase()]
}

export function inspectNarrativeWorldSimulationQuality(content: string): NarrativeWorldSimulationQuality {
  try {
    const envelope = asRecord(parseNarrativeAIJson(content))
    if (!envelope) throw new Error('世界演变响应不是对象')
    const rawEvents = asArray(pick(envelope, ['世界变化', '世界演变', '变化', 'worldChanges']))
    const events = rawEvents.slice(0, 5).map((value, index) => {
      const item = asRecord(value) ?? {}
      const 标题 = asText(pick(item, ['标题', '名称', 'title', 'name']))
      const 类别 = normalizeWorldEnum(pick(item, ['类别', '类型', 'category', 'type']), WORLD_CATEGORY_TO_LABEL)
      const 强度 = normalizeWorldEnum(pick(item, ['强度', '等级', 'intensity', 'level']), WORLD_INTENSITY_TO_LABEL)
      const 描述 = asText(pick(item, ['描述', '说明', '内容', 'description']))
      const 影响区域 = asText(pick(item, ['影响区域', '区域', '影响范围', 'region']))
      const 触发条件 = asText(pick(item, ['触发条件', '条件', 'trigger'])) ?? ''
      const 冷却 = Math.min(99, Math.max(0, asInteger(pick(item, ['冷却', 'cooldown']), 0)))
      if (!标题 || !类别 || !强度 || !描述 || !影响区域) {
        throw new Error(`世界变化[${index}]字段不完整`)
      }
      return { 标题, 类别, 强度, 描述, 影响区域, 触发条件, 冷却 }
    })
    const rawProfileChanges = asArray(pick(envelope, ['概况变更', '概况更新', 'profileChanges']))
    const profileChanges = rawProfileChanges.slice(0, 5).map((value, index) => {
      const item = asRecord(value) ?? {}
      const 字段 = normalizeWorldEnum(pick(item, ['字段', 'field']), WORLD_PROFILE_FIELD_TO_LABEL)
      const 值 = asText(pick(item, ['值', '变更', 'value']))
      if (!字段 || !值) throw new Error(`概况变更[${index}]字段不完整`)
      return { 字段, 值 }
    })
    const result = NarrativeAIWorldSimulationResultSchema.parse({ 世界变化: events, 概况变更: profileChanges })
    return { valid: true, reason: '', result }
  } catch (error) {
    return { valid: false, reason: errorMessage(error) }
  }
}
