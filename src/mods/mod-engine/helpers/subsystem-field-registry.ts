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
 * 契约外字段自动剥离；类型/范围不合法时记录 warn，防止 AI 输出无效 key 污染子系统状态。
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
  /** 字段契约：key=字段名，description 用于 Prompt，schema 用于运行时校验 */
  fields: Record<string, {
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
  // ── personal 级（凡人可见）────────────────────────────
  'character-base': {
    label: '基础属性',
    fields: {
      physiqueDelta: {
        description: '体魄增量（整数；正=增长，负=下降；AI 单轮建议≤2，schema 上限±8）',
        schema: z.coerce.number().min(-8).max(8).optional(),
      },
      mindDelta: {
        description: '心智增量（整数；正=增长，负=下降；AI 单轮建议≤2，schema 上限±8）',
        schema: z.coerce.number().min(-8).max(8).optional(),
      },
      talentAptitudeDelta: {
        description: '悟性增量（整数；正=增长，负=下降；AI 单轮建议≤2，schema 上限±8）',
        schema: z.coerce.number().min(-8).max(8).optional(),
      },
      charismaDelta: {
        description: '魅力增量（整数；正=增长，负=下降；AI 单轮建议≤2，schema 上限±8）',
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
    fields: {
      maxAge: {
        description: '最大寿命绝对值（年；当前可落地字段；年龄由时间系统派生，不写 age）',
        schema: z.coerce.number().min(0).optional(),
      },
      lifespanDelta: {
        description: '最大寿命增量（年；负=减寿，正=增寿；仅叙事明确影响寿命时填写）',
        schema: z.coerce.number().min(-1000).max(1000).optional(),
      },
    },
  },
  'morality': {
    label: '道德',
    fields: {
      delta: {
        description: '善恶变化量（整数；+1=趋善，-1=趋恶；单次仅重大行为可写）',
        schema: z.coerce.number().min(-1).max(1).optional(),
      },
    },
  },
  'luck': {
    label: '气运',
    fields: {
      luck: {
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
      // narrative/post-narrative schema 只允许契约字段流动，旧字段在这里剥离，避免再次漂移。
      return [id, z.object(shape).strip()]
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

/**
 * 根据当前阶段的 narrativeChange 白名单生成给 AI 的字段指南。
 */
export function buildSubsystemGuide(subsystemIds: Iterable<string>): string {
  const lines: string[] = []
  for (const id of subsystemIds) {
    const meta = SUBSYSTEM_FIELD_MAP[id]
    if (!meta) continue
    lines.push(`${id}（${meta.label}）:`)
    for (const [field, description] of Object.entries(meta.fields)) {
      lines.push(`  ${field}: ${description}`)
    }
  }
  return lines.join('\n')
}

/**
 * 校验单条 AI 变更
 *
 * @param change AI 返回的原始 change
 * @returns 校验通过返回清理后的 change，失败返回 null（并输出 warn）
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
 * @returns 通过校验的变更列表（无效项已自动丢弃）
 */
export function validateRoundChanges(changes: SubSystemChanges[]): SubSystemChanges[] {
  if (!changes || changes.length === 0) return []

  const valid: SubSystemChanges[] = []
  for (const change of changes) {
    const validated = validateChange(change)
    if (validated) valid.push(validated)
  }

  const dropped = changes.length - valid.length
  if (dropped > 0) {
    console.warn(`[Validator] 本轮丢弃 ${dropped}/${changes.length} 条不合法变更`)
  }

  return valid
}
