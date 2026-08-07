/**
 * Purpose: Define the single macro-analysis contract for region profiles and knowledge technology.
 * Owner: mod-engine / narrative macro impact
 * Responsibility: Prompt contract, validation, and deterministic DAG translation only.
 */

import { z } from 'zod'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'

import {
  assertRecentStoriesAvailable,
  buildNarrativeAnalysisRoundContext,
  readNarrativeAnalysisEvidenceEventIds,
} from './narrative-background-analysis-context'
import { isSubsystemOpenForPrompt } from './subsystem-prompt-gate'
import type { RecentStoryProjection } from './recent-story-context'
import {
  NARRATIVE_MACRO_CONTEXT_SUBSYSTEM_IDS,
  type NarrativeMacroSubsystemId,
} from './narrative-macro-impact-systems'

export {
  NARRATIVE_MACRO_CONTEXT_SUBSYSTEM_IDS,
  type NarrativeMacroSubsystemId,
} from './narrative-macro-impact-systems'

interface MacroFieldContract {
  aiName: string
  description: string
  schema: z.ZodType
}

interface MacroOperationContract {
  aiName: string
  fields: readonly string[]
  requiredFields?: readonly string[]
  evidenceRequired?: boolean
}

interface MacroSystemContract {
  aiName: string
  operations: Record<string, MacroOperationContract>
  fields: Record<string, MacroFieldContract>
}

const nonEmptyStrings = z.array(z.string().trim().min(1))
const signedDecimal = z.string()
  .regex(/^-?(0|[1-9]\d*)$/u, '必须是十进制整数字符串')
  .refine((value) => value !== '0' && value !== '-0', '变化量不得为零')

const REGION_PROFILE_FIELDS = [
  'summary',
  'climate',
  'ecology',
  'resources',
  'pollution',
  'economy',
  'population',
  'settlement',
  'culture',
  'education',
  'socialStructure',
  'factions',
  'law',
] as const

const MACRO_SYSTEM_CONTRACTS: Record<NarrativeMacroSubsystemId, MacroSystemContract> = {
  'spatial-graph': {
    aiName: '世界区域',
    operations: {
      'update-region-profile': {
        aiName: '更新当前区域概况',
        fields: REGION_PROFILE_FIELDS,
      },
    },
    fields: {
      summary: { aiName: '区域概况', description: '当前区域的整体叙事概况', schema: z.string().trim().min(1) },
      climate: { aiName: '气候', description: '当前区域的气候与季节表现', schema: z.string().trim().min(1) },
      ecology: { aiName: '生态', description: '当前区域的生态概况', schema: z.string().trim().min(1) },
      resources: { aiName: '主要资源', description: '主要资源名称；没有明显资源时返回空数组', schema: nonEmptyStrings },
      pollution: { aiName: '污染', description: '当前区域的污染与环境压力', schema: z.string().trim().min(1) },
      economy: { aiName: '经济', description: '当前区域的经济背景', schema: z.string().trim().min(1) },
      population: { aiName: '人口', description: '当前区域的人口概况', schema: z.string().trim().min(1) },
      settlement: { aiName: '聚落', description: '当前区域的聚落概况', schema: z.string().trim().min(1) },
      culture: { aiName: '文化', description: '当前区域的文化与艺术背景', schema: z.string().trim().min(1) },
      education: { aiName: '教育', description: '当前区域的教育与知识传播', schema: z.string().trim().min(1) },
      socialStructure: { aiName: '社会结构', description: '当前区域的社会结构概况', schema: z.string().trim().min(1) },
      factions: { aiName: '势力关系', description: '当前区域的势力关系概况', schema: z.string().trim().min(1) },
      law: { aiName: '法律秩序', description: '当前区域的法律与秩序概况', schema: z.string().trim().min(1) },
    },
  },
  'culture-tech': {
    aiName: '知识技术',
    operations: {
      'research-domain': { aiName: '推进知识领域', fields: ['maturityDelta'], requiredFields: ['maturityDelta'], evidenceRequired: true },
      'add-application': { aiName: '增加技术应用', fields: ['application', 'diffusionDelta'], requiredFields: ['application'], evidenceRequired: true },
      'record-trend': { aiName: '记录思想趋势', fields: ['name', 'type', 'durationDays', 'intensity'], requiredFields: ['name', 'type', 'durationDays'] },
    },
    fields: {
      maturityDelta: { aiName: '成熟度变化', description: '正有限数字', schema: z.number().finite().gt(0) },
      application: { aiName: '应用名称', description: '非空字符串', schema: z.string().trim().min(1) },
      diffusionDelta: { aiName: '传播度变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      name: { aiName: '趋势名称', description: '非空字符串', schema: z.string().trim().min(1) },
      type: { aiName: '趋势类型', description: '现有知识趋势类型', schema: z.enum(['art', 'philosophy', 'science', 'military', 'commerce', 'religion']) },
      durationDays: { aiName: '持续天数', description: '正整数', schema: z.number().int().min(1) },
      intensity: { aiName: '趋势强度', description: '0 至 100', schema: z.number().min(0).max(100) },
    },
  },
}

const NarrativeAIMacroImpactNodeSchema = z.object({
  节点编号: z.string().regex(/^impact-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  依赖节点: z.array(z.string().regex(/^impact-[a-z0-9]+(?:-[a-z0-9]+)*$/u)),
  系统: z.string().trim().min(1),
  目标对象: z.string().trim().min(1),
  目标上下文: z.string().trim().min(1),
  操作: z.string().trim().min(1),
  变更: z.record(z.string(), z.unknown()),
  强度: z.number().int().min(1).max(100),
  说明: z.string().trim().min(1),
  依据事件: z.array(z.string().trim().min(1)),
}).strict()

export const NarrativeAIMacroImpactDataSchema = z.object({
  影响链: z.array(NarrativeAIMacroImpactNodeSchema).max(16),
}).strict()

export interface NarrativeMacroImpactPromptInput {
  userSegments: [string, string, string, string]
  activeSubsystemIds: NarrativeMacroSubsystemId[]
  allowedEvidenceEventIds: string[]
}

function contractProjection(id: NarrativeMacroSubsystemId): Record<string, unknown> {
  const contract = MACRO_SYSTEM_CONTRACTS[id]
  return {
    系统: contract.aiName,
    内部编号: id,
    操作: Object.fromEntries(Object.entries(contract.operations).map(([operation, definition]) => [
      definition.aiName,
      {
        内部操作: operation,
        必需字段: (definition.requiredFields ?? []).map((field) => contract.fields[field].aiName),
        可用字段: definition.fields.map((field) => contract.fields[field].aiName),
        必须引用历史事件: definition.evidenceRequired === true,
      },
    ])),
    字段: Object.fromEntries(Object.entries(contract.fields).map(([field, definition]) => [
      definition.aiName,
      { 内部字段: field, 说明: definition.description },
    ])),
  }
}

export function buildNarrativeMacroImpactPromptInput(input: {
  subsystemStates: Record<string, SubSystemState>
  roundContext: RoundContext
  recentStories: readonly RecentStoryProjection[]
}): NarrativeMacroImpactPromptInput {
  assertRecentStoriesAvailable(input.recentStories)
  const activeSubsystemIds = NARRATIVE_MACRO_CONTEXT_SUBSYSTEM_IDS.filter((id) => (
    input.subsystemStates[id]?.data !== undefined
    && isSubsystemOpenForPrompt(input.subsystemStates[id], id)
  ))
  if (activeSubsystemIds.length === 0) throw new Error('本轮没有活动宏观模拟系统')
  const allowedEvidenceEventIds = readNarrativeAnalysisEvidenceEventIds(
    input.subsystemStates,
    input.roundContext.contextId,
  )
  const macroSystems = activeSubsystemIds.map((id) => ({
    契约: contractProjection(id),
    当前完整状态: input.subsystemStates[id].data,
  }))
  const influenceSystemIds = [
    'character-base', 'growth-system', 'spatial-graph', 'destiny-pattern',
    'combat-power', 'cultivation', 'culture-tech',
  ]
  const influenceProfile = Object.fromEntries(influenceSystemIds.flatMap((id) => {
    const state = input.subsystemStates[id]
    return state?.data === undefined ? [] : [[id, state.data]]
  }))

  return {
    userSegments: [
      `⟦宏观系统与字段契约⟧${JSON.stringify(macroSystems)}`,
      `⟦玩家影响力证据⟧${JSON.stringify(influenceProfile)}`,
      `⟦回合上下文⟧${JSON.stringify(buildNarrativeAnalysisRoundContext({
        roundContext: input.roundContext,
        allowedEvidenceEventIds,
      }))}`,
      `⟦最近故事⟧${JSON.stringify(input.recentStories)}`,
    ],
    activeSubsystemIds: [...activeSubsystemIds],
    allowedEvidenceEventIds,
  }
}

export interface NarrativeMacroImpactNode {
  nodeId: string
  dependencies: string[]
  strength: number
  change: SubSystemChanges
}

function topologicalOrder(nodes: readonly z.infer<typeof NarrativeAIMacroImpactNodeSchema>[]) {
  const byId = new Map(nodes.map((node) => [node.节点编号, node]))
  if (byId.size !== nodes.length) throw new Error('宏观影响链包含重复节点编号')
  const indegree = new Map(nodes.map((node) => [node.节点编号, 0]))
  const dependents = new Map<string, string[]>()
  for (const node of nodes) {
    const dependencies = new Set(node.依赖节点)
    if (dependencies.size !== node.依赖节点.length) throw new Error(`宏观影响节点重复依赖：${node.节点编号}`)
    for (const dependency of dependencies) {
      if (dependency === node.节点编号) throw new Error(`宏观影响节点不得依赖自身：${node.节点编号}`)
      if (!byId.has(dependency)) throw new Error(`宏观影响节点引用未知依赖：${node.节点编号}`)
      indegree.set(node.节点编号, (indegree.get(node.节点编号) ?? 0) + 1)
      dependents.set(dependency, [...(dependents.get(dependency) ?? []), node.节点编号])
    }
  }
  const queue = [...indegree.entries()].filter(([, count]) => count === 0).map(([id]) => id).sort()
  const ordered: typeof nodes[number][] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    ordered.push(byId.get(id)!)
    for (const dependent of (dependents.get(id) ?? []).sort()) {
      const next = (indegree.get(dependent) ?? 0) - 1
      indegree.set(dependent, next)
      if (next === 0) {
        queue.push(dependent)
        queue.sort()
      }
    }
  }
  if (ordered.length !== nodes.length) throw new Error('宏观影响链存在循环依赖')
  return ordered
}

export function translateNarrativeMacroImpact(input: {
  rawData: unknown
  activeSubsystemIds: readonly NarrativeMacroSubsystemId[]
  allowedEvidenceEventIds: readonly string[]
  currentContextId: string
}): NarrativeMacroImpactNode[] {
  const data = NarrativeAIMacroImpactDataSchema.parse(input.rawData)
  const activeIds = new Set(input.activeSubsystemIds)
  const allowedEvidence = new Set(input.allowedEvidenceEventIds)
  const systemByName = new Map(input.activeSubsystemIds.map((id) => [MACRO_SYSTEM_CONTRACTS[id].aiName, id]))
  const fingerprints = new Set<string>()

  return topologicalOrder(data.影响链).map((node) => {
    const systemId = systemByName.get(node.系统)
    if (!systemId || !activeIds.has(systemId)) throw new Error(`未知或未启用宏观系统：${node.系统}`)
    if (node.目标上下文 !== input.currentContextId) throw new Error(`宏观影响目标上下文不匹配：${node.节点编号}`)
    const contract = MACRO_SYSTEM_CONTRACTS[systemId]
    const operationEntry = Object.entries(contract.operations).find(([, operation]) => operation.aiName === node.操作)
    if (!operationEntry) throw new Error(`宏观系统 ${node.系统} 不支持操作：${node.操作}`)
    const [operation, operationContract] = operationEntry
    if (Object.keys(node.变更).length === 0) throw new Error(`宏观影响节点变更为空：${node.节点编号}`)
    const changes: Record<string, unknown> = {}
    for (const [aiField, value] of Object.entries(node.变更)) {
      const fieldEntry = Object.entries(contract.fields).find(([, field]) => field.aiName === aiField)
      if (!fieldEntry) throw new Error(`宏观系统 ${node.系统} 含未知字段：${aiField}`)
      const [field, fieldContract] = fieldEntry
      if (!operationContract.fields.includes(field)) throw new Error(`宏观操作 ${node.操作} 不接受字段：${aiField}`)
      const parsed = fieldContract.schema.safeParse(value)
      if (!parsed.success) throw new Error(`宏观字段 ${node.系统}.${aiField} 无效`)
      changes[field] = parsed.data
    }
    for (const required of operationContract.requiredFields ?? []) {
      if (!(required in changes)) throw new Error(`宏观操作 ${node.操作} 缺少字段：${contract.fields[required].aiName}`)
    }
    if (operationContract.evidenceRequired && node.依据事件.length === 0) throw new Error(`宏观操作 ${node.操作} 必须引用历史事件`)
    const unknownEvidence = node.依据事件.filter((eventId) => !allowedEvidence.has(eventId))
    if (unknownEvidence.length > 0) throw new Error(`宏观影响引用未知历史事件：${unknownEvidence.join('、')}`)
    const fingerprint = JSON.stringify({ systemId, target: node.目标对象, operation, changes })
    if (fingerprints.has(fingerprint)) throw new Error(`宏观影响重复提交同一节点：${node.节点编号}`)
    fingerprints.add(fingerprint)
    return {
      nodeId: node.节点编号,
      dependencies: [...node.依赖节点],
      strength: node.强度,
      change: {
        id: systemId,
        targetObjectId: node.目标对象,
        targetContextId: node.目标上下文,
        operation,
        evidenceEventIds: [...node.依据事件],
        description: node.说明,
        changes,
      },
    }
  })
}

export function buildNarrativeMacroImpactContractProjection(): Record<string, unknown>[] {
  return NARRATIVE_MACRO_CONTEXT_SUBSYSTEM_IDS.map(contractProjection)
}

export function validateTranslatedNarrativeMacroChange(change: SubSystemChanges): SubSystemChanges | null {
  if (!NARRATIVE_MACRO_CONTEXT_SUBSYSTEM_IDS.includes(change.id as NarrativeMacroSubsystemId)) return null
  const contract = MACRO_SYSTEM_CONTRACTS[change.id as NarrativeMacroSubsystemId]
  const operation = change.operation ? contract.operations[change.operation] : undefined
  if (!operation || Object.keys(change.changes).length === 0) return null
  for (const [field, value] of Object.entries(change.changes)) {
    if (!operation.fields.includes(field)) return null
    const fieldContract = contract.fields[field]
    if (!fieldContract || !fieldContract.schema.safeParse(value).success) return null
  }
  for (const required of operation.requiredFields ?? []) {
    if (!(required in change.changes)) return null
  }
  if (operation.evidenceRequired && (change.evidenceEventIds?.length ?? 0) === 0) return null
  return structuredClone(change)
}
