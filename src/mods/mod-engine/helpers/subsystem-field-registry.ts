/**
 * Purpose: Define the single AI-writable subsystem field and operation registry.
 * Owner: mod-engine / narrative post-processing protocol
 * Responsibility: Prompt metadata, Chinese protocol translation, and strict Zod validation only.
 */

import { z } from 'zod'
import {
  CHARACTER_BASE_OPERATION_FIELDS,
  GROWTH_SYSTEM_OPERATION_FIELDS,
  type SubSystemChanges,
} from '@/foundation'

export interface SubsystemFieldMeta {
  label: string
  fields: Record<string, string>
}

export interface SubsystemFieldContract {
  label: string
  aiAuthority?: 'read-only' | 'proposal' | 'validated-write' | 'event-input'
  allowedScopes?: Array<'global' | 'active-context' | 'explicit-context'>
  operations?: string[]
  operationLabels?: Record<string, string>
  operationFields?: Record<string, readonly string[]>
  aiName?: string
  fields: Record<string, {
    aiName?: string
    description: string
    schema: z.ZodType<unknown>
  }>
}

export const SUBSYSTEM_FIELD_CONTRACTS: Record<string, SubsystemFieldContract> = {
  'world-context-registry': { label: '世界上下文注册表', aiAuthority: 'read-only', allowedScopes: ['explicit-context'], operations: [], fields: {} },
  'contextual-capability-profile': { label: '上下文能力画像', aiAuthority: 'read-only', allowedScopes: ['explicit-context'], operations: [], fields: {} },
  'spatial-graph': {
    label: '世界区域',
    aiName: '世界区域',
    aiAuthority: 'event-input',
    allowedScopes: ['active-context', 'explicit-context'],
    operations: ['移动', '到达', '离开'],
    fields: {},
  },
  'context-transition': {
    label: '上下文切换',
    aiName: '世界切换',
    aiAuthority: 'proposal',
    allowedScopes: ['active-context', 'explicit-context'],
    operations: ['跨界'],
    fields: {},
  },
  'simulation-scope-policy': { label: '模拟范围策略', aiAuthority: 'read-only', allowedScopes: ['global'], operations: [], fields: {} },
  'world-init': {
    label: '世界初始化',
    aiName: '世界初始化',
    aiAuthority: 'proposal',
    allowedScopes: ['explicit-context'],
    operations: ['创建'],
    fields: {},
  },
  'historical-event-ledger': {
    label: '历史事件账本',
    aiName: '历史事件',
    aiAuthority: 'event-input',
    allowedScopes: ['global', 'active-context', 'explicit-context'],
    operations: ['记录', '迁移', '关联'],
    fields: {},
  },
  'growth-system': {
    label: '通用成长',
    aiName: '通用成长',
    aiAuthority: 'validated-write',
    allowedScopes: ['active-context', 'explicit-context'],
    operations: ['learn-skill', 'practice-skill', 'gain-ability', 'adjust-ability'],
    operationLabels: {
      'learn-skill': '学习技能',
      'practice-skill': '练习技能',
      'gain-ability': '获得能力',
      'adjust-ability': '调整能力',
    },
    operationFields: GROWTH_SYSTEM_OPERATION_FIELDS,
    fields: {
      name: { aiName: '名称', description: '新技能或能力的非空名称', schema: z.string().min(1).max(60).optional() },
      category: { aiName: '类别', description: '技能所属的中性类别', schema: z.string().min(1).max(60).optional() },
      description: { aiName: '描述', description: '已经在本轮故事中成立的技能或能力说明', schema: z.string().min(1).max(300).optional() },
      scopeKind: { aiName: '作用域类型', description: 'global 或 context；跨世界稳定能力使用 global，当地知识或技巧使用 context', schema: z.enum(['global', 'context']).optional() },
      scopeContextIds: { aiName: '作用域上下文', description: 'context 时只填当前稳定上下文 ID；global 时为空数组', schema: z.array(z.string().min(1)).max(1).optional() },
      potentialCap: { aiName: '技能潜力上限', description: '正整数经验上限，普通技能建议 100', schema: z.number().int().min(1).max(100000).optional() },
      experienceDelta: { aiName: '经验变化', description: '本轮实际练习带来的正整数经验变化', schema: z.number().int().min(1).max(10000).optional() },
      useCountDelta: { aiName: '使用次数变化', description: '本轮实际使用次数的正整数变化', schema: z.number().int().min(1).max(1000).optional() },
      potential: { aiName: '能力潜力', description: '能力潜力整数，范围 0 至 100', schema: z.number().int().min(0).max(100).optional() },
      learningConstraints: { aiName: '学习约束', description: '能力明确存在的学习或使用约束数组', schema: z.array(z.string().min(1)).optional() },
      potentialDelta: { aiName: '潜力变化', description: '能力潜力整数变化，调整后仍须位于 0 至 100', schema: z.number().int().min(-100).max(100).optional() },
      abilityStatus: { aiName: '能力状态', description: 'latent、active 或 lost', schema: z.enum(['latent', 'active', 'lost']).optional() },
    },
  },
  'character-base': {
    label: '角色状态',
    aiName: '角色状态',
    aiAuthority: 'validated-write',
    allowedScopes: ['global', 'active-context'],
    operations: ['adjust-attributes', 'update-status'],
    operationLabels: {
      'adjust-attributes': '调整属性',
      'update-status': '更新状态',
    },
    operationFields: CHARACTER_BASE_OPERATION_FIELDS,
    fields: {
      physiqueDelta: { aiName: '体魄变化', description: '非零整数；只记录已经稳定形成的持久基础变化，协议范围 -8 至 8', schema: z.number().int().min(-8).max(8).optional() },
      mindDelta: { aiName: '心智变化', description: '非零整数；只记录已经稳定形成的持久基础变化，协议范围 -8 至 8', schema: z.number().int().min(-8).max(8).optional() },
      talentAptitudeDelta: { aiName: '悟性变化', description: '非零整数；只记录已经稳定形成的持久基础变化，协议范围 -8 至 8', schema: z.number().int().min(-8).max(8).optional() },
      charismaDelta: { aiName: '魅力变化', description: '非零整数；只记录已经稳定形成的持久基础变化，协议范围 -8 至 8', schema: z.number().int().min(-8).max(8).optional() },
      vitalityDelta: { aiName: '生命状态变化', description: '本轮事实造成的非零整数变化，范围 -100 至 100', schema: z.number().int().min(-100).max(100).optional() },
      staminaDelta: { aiName: '体力变化', description: '本轮事实造成的非零整数变化，范围 -100 至 100', schema: z.number().int().min(-100).max(100).optional() },
      spiritDelta: { aiName: '精神变化', description: '本轮事实造成的非零整数变化，范围 -100 至 100', schema: z.number().int().min(-100).max(100).optional() },
      conditionId: { aiName: '健康问题ID', description: '更新或解决已有健康问题时使用输入状态中的稳定 ID；新增时可省略，由系统生成', schema: z.string().trim().min(1).max(160).optional() },
      conditionName: { aiName: '健康问题名称', description: '新增或更名时提供的非空名称', schema: z.string().trim().min(1).max(100).optional() },
      conditionSeverity: { aiName: '健康问题严重度', description: '整数 1 至 10', schema: z.number().int().min(1).max(10).optional() },
      conditionSummary: { aiName: '健康问题说明', description: '故事已经建立的健康事实说明', schema: z.string().trim().min(1).max(300).optional() },
      conditionStatus: { aiName: '健康问题状态', description: 'active、recovering 或 resolved', schema: z.enum(['active', 'recovering', 'resolved']).optional() },
      fortuneDelta: { aiName: '气运变化', description: '根据本轮事实判断的隐藏气运非零整数变化，范围 -20 至 20', schema: z.number().int().min(-20).max(20).optional() },
      moralityDelta: { aiName: '道德变化', description: '根据本轮明确行为判断的隐藏道德非零整数变化，范围 -20 至 20', schema: z.number().int().min(-20).max(20).optional() },
      deathCauseKind: { aiName: '死亡原因类型', description: '仅故事明确确认死亡时填写 story、condition、trauma 或 life-ending', schema: z.enum(['story', 'condition', 'trauma', 'life-ending']).optional() },
      deathCauseLabel: { aiName: '死亡原因说明', description: '仅故事明确确认死亡时填写的事实说明', schema: z.string().trim().min(1).max(200).optional() },
    },
  },
  'destiny-pattern': { label: '命格', aiAuthority: 'read-only', allowedScopes: ['global'], operations: [], fields: {} },
  'culture-tech': { label: '文化科技', aiAuthority: 'read-only', allowedScopes: ['active-context', 'explicit-context'], operations: [], fields: {} },
  'time': { label: '时间日历', aiAuthority: 'read-only', allowedScopes: ['global'], operations: [], fields: {} },
  'orchestrator': { label: '叙事编排', aiAuthority: 'read-only', allowedScopes: ['global'], operations: [], fields: {} },
  'narrative-parser': { label: '叙事协议解析', aiAuthority: 'read-only', allowedScopes: ['global'], operations: [], fields: {} },
  'summary-compressor': { label: '摘要压缩', aiAuthority: 'read-only', allowedScopes: ['global', 'explicit-context'], operations: [], fields: {} },
  'subsystem-relevance': { label: '子系统相关性', aiAuthority: 'read-only', allowedScopes: ['active-context'], operations: [], fields: {} },
  'memory-lifecycle': { label: '记忆生命周期', aiAuthority: 'read-only', allowedScopes: ['global', 'explicit-context'], operations: [], fields: {} },
  'causal-delay': {
    label: '延迟因果',
    aiAuthority: 'event-input',
    allowedScopes: ['global', 'active-context', 'explicit-context'],
    operations: ['登记', '解决'],
    fields: {},
  },
  'plot-structure': { label: '剧情结构', aiAuthority: 'read-only', allowedScopes: ['global', 'active-context'], operations: [], fields: {} },
  'foreshadowing': {
    label: '伏笔',
    aiAuthority: 'event-input',
    allowedScopes: ['global', 'active-context', 'explicit-context'],
    operations: ['登记', '解决'],
    fields: {},
  },
  'cultivation': {
    label: '修炼',
    aiName: '修炼',
    aiAuthority: 'validated-write',
    allowedScopes: ['active-context', 'explicit-context'],
    operations: ['adjust-bottleneck', 'set-talents', 'record-breakthrough'],
    operationLabels: {
      'adjust-bottleneck': '调整瓶颈',
      'set-talents': '设置训练天赋',
      'record-breakthrough': '记录突破',
    },
    operationFields: {
      'adjust-bottleneck': ['penaltyDelta'],
      'set-talents': ['talentTags'],
      'record-breakthrough': [],
    },
    fields: {
      penaltyDelta: { description: '瓶颈惩罚变化量（-100 至 100）', schema: z.number().int().min(-100).max(100).optional() },
      talentTags: { description: '训练天赋标签数组；只使用角色已存在的标签', schema: z.array(z.string().min(1)).optional() },
      realmIndex: { description: '当前世界框架中的阶位索引，只读投影，不接受叙事写入', schema: z.number().int().min(0).optional() },
    },
  },
  'combat-power': {
    label: '战力',
    aiName: '力量',
    aiAuthority: 'validated-write',
    allowedScopes: ['active-context', 'explicit-context'],
    operations: ['adjust-progress', 'set-rank', 'rename-rank'],
    operationLabels: {
      'adjust-progress': '调整力量进度',
      'set-rank': '设置世界阶位',
      'rename-rank': '重命名世界阶位',
    },
    operationFields: {
      'adjust-progress': ['progressDelta'],
      'set-rank': ['rankId'],
      'rename-rank': ['rankId', 'label'],
    },
    fields: {
      progressDelta: { description: '当前世界阶位内的力量进度变化量', schema: z.number().int().optional() },
      rankId: { description: '当前世界力量框架中已存在的阶位 ID', schema: z.string().min(1).optional() },
      label: { description: '当前世界阶位的新显示名称', schema: z.string().min(1).max(80).optional() },
    },
  },
}

function buildSubsystemFieldMap(contracts: Record<string, SubsystemFieldContract>): Record<string, SubsystemFieldMeta> {
  return Object.fromEntries(Object.entries(contracts).map(([id, contract]) => [id, {
    label: contract.label,
    fields: Object.fromEntries(Object.entries(contract.fields).map(([field, meta]) => [field, meta.description])),
  }]))
}

function buildSubsystemChangeSchemas(
  contracts: Record<string, SubsystemFieldContract>,
): Record<string, z.ZodObject<z.ZodRawShape>> {
  return Object.fromEntries(Object.entries(contracts).map(([id, contract]) => [
    id,
    z.object(Object.fromEntries(Object.entries(contract.fields).map(([field, meta]) => [field, meta.schema])) as z.ZodRawShape).strict(),
  ]))
}

export const SUBSYSTEM_FIELD_MAP: Record<string, SubsystemFieldMeta> =
  buildSubsystemFieldMap(SUBSYSTEM_FIELD_CONTRACTS)

export const SUBSYSTEM_CHANGE_SCHEMAS: Record<string, z.ZodObject<z.ZodRawShape>> =
  buildSubsystemChangeSchemas(SUBSYSTEM_FIELD_CONTRACTS)

export interface NarrativeAISubsystemContract {
  internalId: string
  aiName: string
  operations: Record<string, string>
  operationFields: Record<string, string[]>
  fields: Record<string, { internalName: string; aiName: string; description: string }>
}

export function getNarrativeAISubsystemContract(
  internalId: string,
  allowedOperations?: readonly string[],
): NarrativeAISubsystemContract {
  const contract = SUBSYSTEM_FIELD_CONTRACTS[internalId]
  if (contract?.aiAuthority !== 'validated-write') throw new Error(`子系统 ${internalId} 未声明为主叙事受校验写入`)
  if (!contract.aiName) throw new Error(`子系统 ${internalId} 缺少主叙事 AI 中文名称`)
  const operationSet = new Set(allowedOperations ?? contract.operations ?? [])
  const unknownOperations = [...operationSet].filter((operation) => !(contract.operations ?? []).includes(operation))
  if (unknownOperations.length > 0) throw new Error(`子系统 ${internalId} 含未知操作族：${unknownOperations.join('、')}`)

  const fields: NarrativeAISubsystemContract['fields'] = {}
  for (const [internalName, meta] of Object.entries(contract.fields)) {
    if (!meta.aiName) throw new Error(`子系统 ${internalId}.${internalName} 缺少主叙事 AI 中文字段名`)
    fields[meta.aiName] = { internalName, aiName: meta.aiName, description: meta.description }
  }
  const operations = Object.fromEntries(Object.entries(contract.operationLabels ?? {})
    .filter(([operation]) => operationSet.has(operation)))
  const operationFields = Object.fromEntries(Object.entries(contract.operationFields ?? {})
    .filter(([operation]) => operationSet.has(operation))
    .map(([operation, internalFields]) => [operation, internalFields.map((field) => {
      const meta = contract.fields[field]
      if (!meta?.aiName) throw new Error(`子系统 ${internalId}.${operation} 引用未知字段 ${field}`)
      return meta.aiName
    })]))
  return { internalId, aiName: contract.aiName, operations, operationFields, fields }
}

export function getNarrativeAISubsystemContracts(
  subsystemIds: Iterable<string>,
  allowedOperationsBySubsystem?: Readonly<Record<string, readonly string[]>>,
): NarrativeAISubsystemContract[] {
  return [...subsystemIds].map((id) => getNarrativeAISubsystemContract(id, allowedOperationsBySubsystem?.[id]))
}

export function translateNarrativeAISystemInstructionToInternal(input: {
  systemName: string
  operation: string
  targetObjectId: string
  targetContextId: string
  evidenceEventIds?: string[]
  description: string
  fields: Record<string, unknown>
}, allowedSubsystemIds: Iterable<string>, allowedOperationsBySubsystem?: Readonly<Record<string, readonly string[]>>): SubSystemChanges {
  const contracts = getNarrativeAISubsystemContracts(allowedSubsystemIds, allowedOperationsBySubsystem)
  const contract = contracts.find((item) => item.aiName === input.systemName)
  if (!contract) throw new Error(`未知或本轮不可写的中文子系统：${input.systemName}`)
  const operation = Object.entries(contract.operations).find(([, aiName]) => aiName === input.operation)?.[0]
  if (!operation) throw new Error(`子系统 ${input.systemName} 含本次分析不允许的操作：${input.operation}`)
  const changes: Record<string, unknown> = {}
  const allowedFields = contract.operationFields[operation]
  for (const [aiName, value] of Object.entries(input.fields)) {
    const field = contract.fields[aiName]
    if (!field) throw new Error(`子系统 ${input.systemName} 含未知中文字段：${aiName}`)
    if (allowedFields && !allowedFields.includes(aiName)) throw new Error(`操作 ${input.operation} 不接受字段：${aiName}`)
    changes[field.internalName] = value
  }
  return {
    id: contract.internalId,
    targetObjectId: input.targetObjectId,
    targetContextId: input.targetContextId,
    operation,
    evidenceEventIds: [...(input.evidenceEventIds ?? [])],
    description: input.description,
    changes,
  }
}

export function buildSubsystemGuide(subsystemIds: Iterable<string>): string {
  const lines: string[] = []
  for (const contract of getNarrativeAISubsystemContracts(subsystemIds)) {
    lines.push(`${contract.aiName}：`)
    for (const [operation, aiName] of Object.entries(contract.operations)) {
      const fields = contract.operationFields[operation] ?? []
      lines.push(`  操作“${aiName}”只允许：${fields.map((field) => `“${field}”`).join('、') || '空变更对象'}`)
    }
    for (const field of Object.values(contract.fields)) lines.push(`  ${field.aiName}：${field.description}`)
  }
  return lines.join('\n')
}

export function validateChange(
  change: SubSystemChanges,
  options?: { allowUnknownSubsystem?: boolean },
): SubSystemChanges | null {
  const schema = SUBSYSTEM_CHANGE_SCHEMAS[change.id]
  if (!schema) return options?.allowUnknownSubsystem ? change : null
  const contract = SUBSYSTEM_FIELD_CONTRACTS[change.id]
  const allowedFields = change.operation ? contract.operationFields?.[change.operation] : undefined
  if (contract.operationFields && !allowedFields) return null
  if (allowedFields && Object.keys(change.changes).some((field) => !allowedFields.includes(field))) return null
  const result = schema.safeParse(change.changes)
  if (!result.success) return null
  return { ...change, changes: result.data as Record<string, unknown> }
}

export function validateRoundChanges(changes: SubSystemChanges[]): SubSystemChanges[] {
  if (!changes?.length) return []
  const valid = changes.map((change) => validateChange(change))
  return valid.some((change) => !change) ? [] : valid as SubSystemChanges[]
}
