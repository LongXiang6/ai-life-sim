/**
 * @module narrative-macro-impact-context.ts
 * @description 宏观影响 AI 的完整状态、玩家影响力、DAG 协议与本地校验
 * @mod mod-engine
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

const nonEmptyStrings = z.array(z.string().trim().min(1)).min(1)
const signedDecimal = z.string()
  .regex(/^-?(0|[1-9]\d*)$/u, '必须是十进制整数字符串')
  .refine((value) => value !== '0' && value !== '-0', '变化量不得为零')

const MACRO_SYSTEM_CONTRACTS: Record<NarrativeMacroSubsystemId, MacroSystemContract> = {
  geography: {
    aiName: '地理',
    operations: {
      'record-mutation': { aiName: '记录地理变化', fields: ['terrainClass', 'displayName', 'elevation', 'temperature', 'humidity', 'traversability', 'traitTags', 'hazardTags'], evidenceRequired: true },
    },
    fields: {
      terrainClass: { aiName: '地形类型', description: '目标节点的新地形类别', schema: z.string().trim().min(1) },
      displayName: { aiName: '显示名称', description: '目标节点的新显示名', schema: z.string().trim().min(1) },
      elevation: { aiName: '海拔', description: '有限数字', schema: z.number().finite() },
      temperature: { aiName: '温度', description: '有限数字', schema: z.number().finite() },
      humidity: { aiName: '湿度', description: '有限数字', schema: z.number().finite() },
      traversability: { aiName: '通行度', description: '0 至 1', schema: z.number().min(0).max(1) },
      traitTags: { aiName: '特征标签', description: '非空字符串数组', schema: nonEmptyStrings },
      hazardTags: { aiName: '危险标签', description: '非空字符串数组', schema: nonEmptyStrings },
    },
  },
  'natural-resource': {
    aiName: '自然资源',
    operations: {
      'record-transaction': { aiName: '记录资源变化', fields: ['delta'], requiredFields: ['delta'], evidenceRequired: true },
    },
    fields: {
      delta: { aiName: '变化量', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
    },
  },
  climate: {
    aiName: '气候',
    operations: {
      'record-disaster': { aiName: '记录灾害', fields: ['type', 'severity', 'durationDays', 'affectedNodeIds'], requiredFields: ['type', 'severity', 'durationDays', 'affectedNodeIds'], evidenceRequired: true },
      'adjust-baseline': { aiName: '调整气候基线', fields: ['temperatureOffsetDelta', 'humidityDelta'] },
    },
    fields: {
      type: { aiName: '灾害类型', description: 'flood/drought/earthquake/tsunami/volcano/storm/blizzard/wildfire/plague/locust', schema: z.enum(['flood', 'drought', 'earthquake', 'tsunami', 'volcano', 'storm', 'blizzard', 'wildfire', 'plague', 'locust']) },
      severity: { aiName: '严重度', description: '0 至 100', schema: z.number().min(0).max(100) },
      durationDays: { aiName: '持续天数', description: '正整数', schema: z.number().int().min(1) },
      affectedNodeIds: { aiName: '影响节点', description: '已存在空间节点 ID 数组', schema: nonEmptyStrings },
      temperatureOffsetDelta: { aiName: '温度偏移变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      humidityDelta: { aiName: '湿度变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
    },
  },
  ecology: {
    aiName: '生态',
    operations: {
      'adjust-population': { aiName: '调整物种数量', fields: ['populationDelta'], requiredFields: ['populationDelta'] },
      'adjust-habitat': { aiName: '调整栖息地', fields: ['habitatIntegrityDelta'], requiredFields: ['habitatIntegrityDelta'] },
    },
    fields: {
      populationDelta: { aiName: '物种数量变化', description: '非零十进制整数字符串', schema: signedDecimal },
      habitatIntegrityDelta: { aiName: '栖息地完整度变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
    },
  },
  pollution: {
    aiName: '污染',
    operations: {
      'adjust-pollution': { aiName: '调整污染', fields: ['pollutionDelta', 'annualEmission', 'annualDecay'] },
    },
    fields: {
      pollutionDelta: { aiName: '污染指数变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      annualEmission: { aiName: '年排放', description: '非负有限数字', schema: z.number().finite().min(0) },
      annualDecay: { aiName: '年衰减', description: '非负有限数字', schema: z.number().finite().min(0) },
    },
  },
  economy: {
    aiName: '宏观经济',
    operations: {
      'adjust-economy': { aiName: '调整经济', fields: ['priceIndexDelta', 'taxRateDelta', 'productivityDelta', 'technologyAdoptionDelta'] },
    },
    fields: {
      priceIndexDelta: { aiName: '物价指数变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      taxRateDelta: { aiName: '税率变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      productivityDelta: { aiName: '生产力变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      technologyAdoptionDelta: { aiName: '技术采用变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
    },
  },
  population: {
    aiName: '宏观人口',
    operations: {
      'adjust-population': { aiName: '调整人口', fields: ['totalPopulationDelta', 'urbanizationRateDelta'] },
    },
    fields: {
      totalPopulationDelta: { aiName: '总人口变化', description: '非零十进制整数字符串', schema: signedDecimal },
      urbanizationRateDelta: { aiName: '城镇化率变化', description: '非零有限数字，比例单位', schema: z.number().finite().refine((value) => value !== 0) },
    },
  },
  settlement: {
    aiName: '聚落',
    operations: {
      'adjust-settlement': { aiName: '调整聚落', fields: ['prosperityDelta', 'safetyDelta'] },
    },
    fields: {
      prosperityDelta: { aiName: '繁荣度变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      safetyDelta: { aiName: '安全度变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
    },
  },
  'social-stratification': {
    aiName: '社会结构',
    operations: {
      'adjust-group': { aiName: '调整群体', fields: ['populationShareDelta', 'privilegeDelta', 'mobilityBarrierDelta'] },
    },
    fields: {
      populationShareDelta: { aiName: '人口占比变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      privilegeDelta: { aiName: '特权变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      mobilityBarrierDelta: { aiName: '流动壁垒变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
    },
  },
  'faction-dynamics': {
    aiName: '势力格局',
    operations: {
      'adjust-influence': { aiName: '调整势力影响力', fields: ['influenceDelta'], requiredFields: ['influenceDelta'] },
      'adjust-contribution': { aiName: '调整玩家贡献', fields: ['contributionDelta'], requiredFields: ['contributionDelta'] },
      'set-relation': { aiName: '设置势力关系', fields: ['otherEntityId', 'relation'], requiredFields: ['otherEntityId', 'relation'] },
    },
    fields: {
      influenceDelta: { aiName: '影响力变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      contributionDelta: { aiName: '贡献变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      otherEntityId: { aiName: '另一势力编号', description: '已存在势力实体 ID', schema: z.string().trim().min(1) },
      relation: { aiName: '关系值', description: '0 至 100', schema: z.number().min(0).max(100) },
    },
  },
  legal: {
    aiName: '制度法律',
    operations: {
      'adjust-institution': { aiName: '调整制度', fields: ['enforcementDelta', 'corruptionDelta'] },
    },
    fields: {
      enforcementDelta: { aiName: '执行力变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      corruptionDelta: { aiName: '腐败变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
    },
  },
  'conflict-cycle': {
    aiName: '冲突周期',
    operations: {
      'adjust-tension': { aiName: '调整冲突张力', fields: ['tensionDelta'], requiredFields: ['tensionDelta'] },
    },
    fields: {
      tensionDelta: { aiName: '张力变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
    },
  },
  culture: {
    aiName: '文化',
    operations: {
      'adjust-culture': { aiName: '调整文化', fields: ['traditionDelta', 'reformPressureDelta', 'artProsperityDelta', 'valueKey', 'valueDelta'] },
    },
    fields: {
      traditionDelta: { aiName: '传统强度变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      reformPressureDelta: { aiName: '改革压力变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      artProsperityDelta: { aiName: '艺术繁荣变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
      valueKey: { aiName: '价值维度', description: '传统/集体/理性/信仰等现有内部维度 ID', schema: z.string().trim().min(1) },
      valueDelta: { aiName: '价值维度变化', description: '非零有限数字', schema: z.number().finite().refine((value) => value !== 0) },
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
      type: { aiName: '趋势类型', description: 'art/philosophy/science/military/commerce/religion', schema: z.enum(['art', 'philosophy', 'science', 'military', 'commerce', 'religion']) },
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
    'reputation', 'economy', 'work', 'faction-dynamics', 'relationship-system',
    'works', 'achievement', 'combat-power', 'cultivation', 'faith',
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
      if (!byId.has(dependency)) throw new Error(`宏观影响节点引用未知依赖：${dependency}`)
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
  const systemByName = new Map(
    input.activeSubsystemIds.map((id) => [MACRO_SYSTEM_CONTRACTS[id].aiName, id]),
  )
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
      if (!operationContract.fields.includes(field)) {
        throw new Error(`宏观操作 ${node.操作} 不接受字段：${aiField}`)
      }
      const parsed = fieldContract.schema.safeParse(value)
      if (!parsed.success) throw new Error(`宏观字段 ${node.系统}.${aiField} 无效`)
      changes[field] = parsed.data
    }
    for (const required of operationContract.requiredFields ?? []) {
      if (!(required in changes)) throw new Error(`宏观操作 ${node.操作} 缺少字段：${contract.fields[required].aiName}`)
    }
    if (operationContract.evidenceRequired && node.依据事件.length === 0) {
      throw new Error(`宏观操作 ${node.操作} 必须引用历史事件`)
    }
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

export function validateTranslatedNarrativeMacroChange(
  change: SubSystemChanges,
): SubSystemChanges | null {
  if (!NARRATIVE_MACRO_CONTEXT_SUBSYSTEM_IDS.includes(change.id as NarrativeMacroSubsystemId)) {
    return null
  }
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
