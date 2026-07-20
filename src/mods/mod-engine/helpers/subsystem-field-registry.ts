/**
 * @module subsystem-field-registry.ts
 * @description 子系统可变更字段注册表 —— 告诉 AI 每个子系统接受哪些变更字段 + Zod 校验
 * @mod mod-engine
 *
 * 用途：注入 Prompt，让 AI 能精确输出各子系统的结构化 changes。
 * 覆盖：personal + town 级核心系统（16 个），按影响力分级逐步扩展。
 * 维护：新增子系统时在此注册一个条目即可，无需改 Prompt 模板。
 *
 * Zod 校验：SUBSYSTEM_CHANGE_SCHEMAS 用于验证 AI 返回的 changes，
 * 契约外字段与类型/范围不合法项均拒绝；消费方必须整包拒绝本轮 AI 状态变更。
 */

import { z } from 'zod'
import type { SubSystemChanges } from '@/foundation'

// ============================================================
// 类型定义
// ============================================================

export interface SubsystemFieldMeta {
  /** 子系统中文名 */
  label: string
  /** 字段说明：key=字段名, value=说明（含类型和范围） */
  fields: Record<string, string>
}

export interface SubsystemFieldContract {
  /** 子系统中文名 */
  label: string
  /** PD-025：叙事 AI 对该系统的显式权限模式 */
  aiAuthority?: 'read-only' | 'proposal' | 'validated-write' | 'event-input'
  /** 合法作用域；缺省表示仅沿用当前旧契约，不代表跨上下文授权 */
  allowedScopes?: Array<'global' | 'active-context' | 'explicit-context'>
  /** 该系统登记的标准操作族 */
  operations?: string[]
  /** 主叙事 AI 协议中的唯一中文系统名；未声明时禁止向 AI 开放 */
  aiName?: string
  /** 字段契约：key=字段名，description 用于 Prompt，schema 用于运行时校验 */
  fields: Record<string, {
    /** 主叙事 AI 协议中的唯一中文字段名；未声明时禁止向 AI 开放 */
    aiName?: string
    description: string
    schema: z.ZodType<unknown>
  }>
}

// ============================================================
// 子系统字段契约（唯一真源：字段说明 + Zod schema）
// ============================================================

/** 伤病/疾病条目 */
const ailmentEntry = z.object({
  name: z.string(),
  severity: z.coerce.number().min(1).max(10),
  rounds: z.coerce.number().min(0).optional(),
})

/** 关系条目 */
const relationEntry = z.object({
  name: z.string(),
  type: z.string().optional(),
  reason: z.string().optional(),
  affinity: z.coerce.number().optional(),
})

export const SUBSYSTEM_FIELD_CONTRACTS: Record<string, SubsystemFieldContract> = {
  // ── P0 多世界基础（不扩大 narrativeChange 白名单）────────────
  'world-context-registry': {
    label: '世界上下文注册表',
    aiName: '世界上下文',
    aiAuthority: 'read-only',
    allowedScopes: ['explicit-context'],
    operations: [],
    fields: {},
  },
  'contextual-capability-profile': {
    label: '上下文能力画像',
    aiName: '世界能力',
    aiAuthority: 'read-only',
    allowedScopes: ['explicit-context'],
    operations: [],
    fields: {},
  },
  'spatial-graph': {
    label: '空间关系图',
    aiName: '空间关系',
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
  'simulation-scope-policy': {
    label: '模拟范围策略',
    aiName: '模拟范围',
    aiAuthority: 'read-only',
    allowedScopes: ['global'],
    operations: [],
    fields: {},
  },
  'world-init': {
    label: '世界初始化',
    aiName: '世界初始化',
    aiAuthority: 'proposal',
    allowedScopes: ['explicit-context'],
    operations: ['创建'],
    fields: {},
  },
  'world-entity': {
    label: '世界实体',
    aiName: '世界实体',
    aiAuthority: 'event-input',
    allowedScopes: ['active-context', 'explicit-context'],
    operations: ['创建', '更新'],
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
  'time': { label: '时间', aiAuthority: 'read-only', allowedScopes: ['global'], operations: [], fields: {} },
  'orchestrator': { label: '叙事编排', aiAuthority: 'read-only', allowedScopes: ['global'], operations: [], fields: {} },
  'narrative-parser': { label: '叙事协议解析', aiAuthority: 'read-only', allowedScopes: ['global'], operations: [], fields: {} },
  'summary-compressor': { label: '摘要压缩', aiAuthority: 'read-only', allowedScopes: ['global', 'explicit-context'], operations: [], fields: {} },
  'memory-engine': { label: '长期记忆', aiAuthority: 'read-only', allowedScopes: ['global', 'explicit-context'], operations: [], fields: {} },
  'subsystem-relevance': { label: '子系统相关性', aiAuthority: 'read-only', allowedScopes: ['active-context'], operations: [], fields: {} },
  'memory-lifecycle': { label: '记忆生命周期', aiAuthority: 'read-only', allowedScopes: ['global', 'explicit-context'], operations: [], fields: {} },
  'memory-forgetting': { label: '可解释遗忘', aiAuthority: 'read-only', allowedScopes: ['global', 'explicit-context'], operations: [], fields: {} },
  'causal-delay': { label: '延迟因果', aiAuthority: 'event-input', allowedScopes: ['global', 'active-context', 'explicit-context'], operations: ['登记', '解决'], fields: {} },
  'plot-structure': { label: '剧情结构', aiAuthority: 'read-only', allowedScopes: ['global', 'active-context'], operations: [], fields: {} },
  'foreshadowing': { label: '伏笔', aiAuthority: 'event-input', allowedScopes: ['global', 'active-context', 'explicit-context'], operations: ['登记', '解决'], fields: {} },
  'core-memory': { label: '核心记忆', aiAuthority: 'read-only', allowedScopes: ['global', 'explicit-context'], operations: [], fields: {} },

  // ── personal 级（凡人可见）────────────────────────────
  'character-base': {
    label: '基础属性',
    aiName: '基础属性',
    aiAuthority: 'validated-write',
    allowedScopes: ['global'],
    operations: ['增量'],
    fields: {
      physiqueDelta: {
        aiName: '体魄变化',
        description: '整数；正为增长，负为下降；建议单轮不超过2，协议范围为-8至8',
        schema: z.coerce.number().min(-8).max(8).optional(),
      },
      mindDelta: {
        aiName: '心智变化',
        description: '整数；正为增长，负为下降；建议单轮不超过2，协议范围为-8至8',
        schema: z.coerce.number().min(-8).max(8).optional(),
      },
      talentAptitudeDelta: {
        aiName: '悟性变化',
        description: '整数；正为增长，负为下降；建议单轮不超过2，协议范围为-8至8',
        schema: z.coerce.number().min(-8).max(8).optional(),
      },
      charismaDelta: {
        aiName: '魅力变化',
        description: '整数；正为增长，负为下降；建议单轮不超过2，协议范围为-8至8',
        schema: z.coerce.number().min(-8).max(8).optional(),
      },
    },
  },
  'health': {
    label: '健康',
    fields: {
      hpDelta: {
        description: '生命值变化（正=恢复，负=受伤，范围 -50~+20）',
        schema: z.coerce.number().min(-50).max(20).optional(),
      },
      staminaDelta: {
        description: '体力变化量',
        schema: z.coerce.number().optional(),
      },
      spiritDelta: {
        description: '精神变化量',
        schema: z.coerce.number().optional(),
      },
      addDiseases: {
        description: '新增疾病 [{name, severity}]',
        schema: z.array(ailmentEntry).optional(),
      },
      addInjuries: {
        description: '新增伤势 [{name, severity}]',
        schema: z.array(ailmentEntry).optional(),
      },
    },
  },
  'lifespan': {
    label: '寿命',
    aiName: '寿命',
    aiAuthority: 'validated-write',
    allowedScopes: ['global', 'active-context'],
    operations: ['增量', '设值'],
    fields: {
      maxAge: {
        aiName: '最大寿命',
        description: '最大寿命绝对值，单位为年；当前年龄由时间系统派生，禁止提交年龄',
        schema: z.coerce.number().min(0).optional(),
      },
      lifespanDelta: {
        aiName: '最大寿命变化',
        description: '最大寿命增量（年；负=减寿，正=增寿；仅叙事明确影响寿命时填写）',
        schema: z.coerce.number().min(-1000).max(1000).optional(),
      },
    },
  },
  'morality': {
    label: '道德',
    aiName: '道德',
    aiAuthority: 'validated-write',
    allowedScopes: ['global'],
    operations: ['增量'],
    fields: {
      delta: {
        aiName: '道德变化',
        description: '善恶变化量（整数；+1=趋善，-1=趋恶；单次仅重大行为可写）',
        schema: z.coerce.number().min(-1).max(1).optional(),
      },
    },
  },
  'luck': {
    label: '气运',
    aiName: '气运',
    aiAuthority: 'validated-write',
    allowedScopes: ['global', 'active-context'],
    operations: ['设值'],
    fields: {
      luck: {
        aiName: '气运绝对值',
        description: '气运绝对值（-10~+10；仅重大人生转折可设置，通常每次变化≤1）',
        schema: z.coerce.number().min(-10).max(10).optional(),
      },
    },
  },
  'faith': {
    label: '信仰',
    fields: {
      devotionLevel: {
        description: '虔诚等级（0-100）',
        schema: z.coerce.number().min(0).max(100).optional(),
      },
      delta: {
        description: '虔诚变化量',
        schema: z.coerce.number().optional(),
      },
    },
  },
  'family': {
    label: '家庭',
    fields: {
      status: {
        description: '家庭状态（stable/conflict/dispersed/reunited）',
        schema: z.enum(['stable', 'conflict', 'dispersed', 'reunited']).optional(),
      },
      members: {
        description: '家庭成员数量变化',
        schema: z.coerce.number().optional(),
      },
    },
  },
  'education': {
    label: '教育',
    fields: {
      level: {
        description: '教育等级（0-10）',
        schema: z.coerce.number().min(0).max(10).optional(),
      },
      progress: {
        description: '学习进度（0-100）',
        schema: z.coerce.number().min(0).max(100).optional(),
      },
      graduated: {
        description: '是否毕业',
        schema: z.boolean().optional(),
      },
    },
  },
  'work': {
    label: '工作',
    fields: {
      job: {
        description: '职业名称',
        schema: z.string().optional(),
      },
      income: {
        description: '收入',
        schema: z.coerce.number().optional(),
      },
      promotion: {
        description: '是否晋升',
        schema: z.boolean().optional(),
      },
    },
  },

  // ── town 级（强者可见）────────────────────────────
  'economy': {
    label: '经济',
    fields: {
      wealth: {
        description: '财富变化量',
        schema: z.coerce.number().optional(),
      },
      priceIndex: {
        description: '物价指数（100=正常）',
        schema: z.coerce.number().optional(),
      },
      activityLevel: {
        description: '经济活动水平（0-1）',
        schema: z.coerce.number().min(0).max(1).optional(),
      },
      socialClass: {
        description: '社会阶层（noble/commoner/peasant/merchant/cultivator）',
        schema: z.enum(['noble', 'commoner', 'peasant', 'merchant', 'cultivator']).optional(),
      },
    },
  },
  'reputation': {
    label: '声望',
    fields: {
      fame: {
        description: '声望值（0-100）',
        schema: z.coerce.number().min(0).max(100).optional(),
      },
      delta: {
        description: '声望变化量',
        schema: z.coerce.number().optional(),
      },
      addFame: {
        description: '知名度增量（±值）',
        schema: z.coerce.number().optional(),
      },
      setFame: {
        description: '设置知名度绝对值',
        schema: z.coerce.number().optional(),
      },
      addReputation: {
        description: '维度声望增量（需配合 dimension）',
        schema: z.coerce.number().optional(),
      },
      dimension: {
        description: '维度：military/political/academic/economic/moral/religious',
        schema: z.string().optional(),
      },
    },
  },
  'relationship': {
    label: '关系',
    fields: {
      addRelation: {
        description: '新增关系 [{name, type, affinity}]',
        schema: z.array(relationEntry).optional(),
      },
      affinityDelta: {
        description: '好感变化（±值）',
        schema: z.coerce.number().optional(),
      },
    },
  },
  'market': {
    label: '市场',
    fields: {
      activityLevel: {
        description: '市场活跃度（0-1）',
        schema: z.coerce.number().min(0).max(1).optional(),
      },
      trend: {
        description: '市场趋势（bullish/bearish/stable）',
        schema: z.enum(['bullish', 'bearish', 'stable']).optional(),
      },
    },
  },
  'population': {
    label: '人口',
    fields: {
      total: {
        description: '人口变化量',
        schema: z.coerce.number().optional(),
      },
      growthRate: {
        description: '增长率',
        schema: z.coerce.number().optional(),
      },
      migrationDirection: {
        description: '迁移方向（inward/outward/none）',
        schema: z.enum(['inward', 'outward', 'none']).optional(),
      },
    },
  },
  'cultivation': {
    label: '修炼',
    fields: {
      realm: {
        description: '修炼境界（1-9：炼气→大乘）',
        schema: z.coerce.number().min(1).max(9).optional(),
      },
      cultivationProgress: {
        description: '修炼进度（0-100）',
        schema: z.coerce.number().min(0).max(100).optional(),
      },
      bottleneck: {
        description: '瓶颈（physique/mind/comprehension/none）',
        schema: z.enum(['physique', 'mind', 'comprehension', 'none']).optional(),
      },
    },
  },
  'combat-power': {
    label: '战力',
    fields: {
      rank: {
        description: '战力等级（0-100）',
        schema: z.coerce.number().min(0).max(100).optional(),
      },
      delta: {
        description: '战力变化量',
        schema: z.coerce.number().optional(),
      },
    },
  },
}

// ============================================================
// 派生表（保持旧导出名兼容调用方）
// ============================================================

function buildSubsystemFieldMap(
  contracts: Record<string, SubsystemFieldContract>,
): Record<string, SubsystemFieldMeta> {
  return Object.fromEntries(
    Object.entries(contracts).map(([id, contract]) => [
      id,
      {
        label: contract.label,
        fields: Object.fromEntries(
          Object.entries(contract.fields).map(([field, meta]) => [field, meta.description]),
        ),
      },
    ]),
  )
}

function buildSubsystemChangeSchemas(
  contracts: Record<string, SubsystemFieldContract>,
): Record<string, z.ZodObject<z.ZodRawShape>> {
  return Object.fromEntries(
    Object.entries(contracts).map(([id, contract]) => {
      const shape = Object.fromEntries(
        Object.entries(contract.fields).map(([field, meta]) => [field, meta.schema]),
      ) as z.ZodRawShape
      // 契约外字段属于非法 META，禁止静默剥离后把剩余字段伪装成完整结果。
      return [id, z.object(shape).strict()]
    }),
  )
}

/**
 * Prompt/文档用字段说明表。由 SUBSYSTEM_FIELD_CONTRACTS 派生，禁止手写第二份字段列表。
 */
export const SUBSYSTEM_FIELD_MAP: Record<string, SubsystemFieldMeta> =
  buildSubsystemFieldMap(SUBSYSTEM_FIELD_CONTRACTS)

/**
 * narrative/post-narrative 变更校验 Schema。由 SUBSYSTEM_FIELD_CONTRACTS 派生。
 */
export const SUBSYSTEM_CHANGE_SCHEMAS: Record<string, z.ZodObject<z.ZodRawShape>> =
  buildSubsystemChangeSchemas(SUBSYSTEM_FIELD_CONTRACTS)

export interface NarrativeAISubsystemContract {
  internalId: string
  aiName: string
  fields: Record<string, {
    internalName: string
    aiName: string
    description: string
  }>
}

/**
 * 返回主叙事 AI 可见的中文子系统契约。
 * 未配置中文名时显式失败，避免未来启用新写入系统后重新泄漏英文协议。
 */
export function getNarrativeAISubsystemContract(internalId: string): NarrativeAISubsystemContract {
  const contract = SUBSYSTEM_FIELD_CONTRACTS[internalId]
  if (contract?.aiAuthority !== 'validated-write') {
    throw new Error(`子系统 ${internalId} 未声明为主叙事受校验写入`)
  }
  if (!contract.aiName) {
    throw new Error(`子系统 ${internalId} 缺少主叙事 AI 中文名称`)
  }

  const fields: NarrativeAISubsystemContract['fields'] = {}
  for (const [internalName, meta] of Object.entries(contract.fields)) {
    if (!meta.aiName) {
      throw new Error(`子系统 ${internalId}.${internalName} 缺少主叙事 AI 中文字段名`)
    }
    fields[meta.aiName] = {
      internalName,
      aiName: meta.aiName,
      description: meta.description,
    }
  }

  return {
    internalId,
    aiName: contract.aiName,
    fields,
  }
}

export function getNarrativeAISubsystemContracts(
  subsystemIds: Iterable<string>,
): NarrativeAISubsystemContract[] {
  return [...subsystemIds].map(getNarrativeAISubsystemContract)
}

/** 将 AI 中文系统名与字段名严格转回内部运行契约；未知项由调用方整包拒绝。 */
export function translateNarrativeAIChangeToInternal(input: {
  systemName: string
  description: string
  fields: Record<string, unknown>
}, allowedSubsystemIds: Iterable<string>): SubSystemChanges {
  const contracts = getNarrativeAISubsystemContracts(allowedSubsystemIds)
  const contract = contracts.find((item) => item.aiName === input.systemName)
  if (!contract) {
    throw new Error(`未知或本轮不可写的中文子系统：${input.systemName}`)
  }

  const changes: Record<string, unknown> = {}
  for (const [aiName, value] of Object.entries(input.fields)) {
    const field = contract.fields[aiName]
    if (!field) {
      throw new Error(`子系统 ${input.systemName} 含未知中文字段：${aiName}`)
    }
    changes[field.internalName] = value
  }

  return {
    id: contract.internalId,
    description: input.description,
    changes,
  }
}

/**
 * 根据当前阶段的 narrativeChange 白名单生成给 AI 的字段指南。
 */
export function buildSubsystemGuide(subsystemIds: Iterable<string>): string {
  const lines: string[] = []
  for (const contract of getNarrativeAISubsystemContracts(subsystemIds)) {
    lines.push(`${contract.aiName}：`)
    lines.push(`  “变更”对象只允许键：${Object.values(contract.fields).map((field) => `“${field.aiName}”`).join('、')}`)
    for (const field of Object.values(contract.fields)) {
      lines.push(`  ${field.aiName}：${field.description}`)
    }
  }
  return lines.join('\n')
}

/**
 * 校验单条 AI 变更
 *
 * @param change AI 返回的原始 change
 * @returns 校验通过返回规范化后的 change，失败返回 null（并输出 warn）
 */
export function validateChange(
  change: SubSystemChanges,
  options?: { allowUnknownSubsystem?: boolean },
): SubSystemChanges | null {
  const schema = SUBSYSTEM_CHANGE_SCHEMAS[change.id]
  if (!schema) {
    if (options?.allowUnknownSubsystem) {
      return change
    }
    console.warn(`[Validator] 未知子系统 "${change.id}"，变更被丢弃:`, change.description)
    return null
  }

  const result = schema.safeParse(change.changes)
  if (!result.success) {
    console.warn(
      `[Validator] ${change.id} 变更校验失败:`,
      result.error?.issues?.map((i) => `${i.path.join('.')}: ${i.message}`),
      '\n  原始数据:', JSON.stringify(change.changes),
    )
    return null
  }

  return { ...change, changes: result.data as Record<string, unknown> }
}

/**
 * 批量校验 AI 返回的 changes 数组
 * @returns 仅当全部变更均合法时返回完整列表；任一项非法则整包返回空数组
 */
export function validateRoundChanges(changes: SubSystemChanges[]): SubSystemChanges[] {
  if (!changes || changes.length === 0) return []

  const valid: SubSystemChanges[] = []
  let invalidCount = 0
  for (const change of changes) {
    const validated = validateChange(change)
    if (validated) {
      valid.push(validated)
    } else {
      invalidCount++
    }
  }

  if (invalidCount > 0) {
    console.warn(`[Validator] 本轮存在 ${invalidCount}/${changes.length} 条不合法变更，整包拒绝`)
    return []
  }

  return valid
}
