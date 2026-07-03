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
 * 不合法字段自动丢弃并记录 warn，防止 AI 输出无效 key 污染子系统状态。
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

// ============================================================
// 注册表（按影响力分级：personal → town）
// ============================================================

export const SUBSYSTEM_FIELD_MAP: Record<string, SubsystemFieldMeta> = {
  // ── personal 级（凡人可见）────────────────────────────
  'character-base': {
    label: '基础属性',
    fields: {
      'physique': '体魄（0-100）',
      'mind': '心智（0-100）',
      'comprehension': '悟性（0-100）',
      'charisma': '魅力（0-100）',
      'background': '出身（0-100）',
    },
  },
  'health': {
    label: '健康',
    fields: {
      'hpDelta': '生命值变化（正=恢复，负=受伤，范围 -50~+20）',
      'staminaDelta': '体力变化量',
      'spiritDelta': '精神变化量',
      'addDiseases': '新增疾病 [{name, severity}]',
      'addInjuries': '新增伤势 [{name, severity}]',
    },
  },
  'lifespan': {
    label: '寿命',
    fields: {
      'age': '当前年龄',
      'lifespanDelta': '寿命变化（±年数）',
      'maxAge': '最大寿命',
    },
  },
  'morality': {
    label: '道德',
    fields: {
      'value': '道德值（-100~100，负=邪恶，正=善良）',
      'delta': '道德变化量',
    },
  },
  'luck': {
    label: '气运',
    fields: {
      'bonus': '气运加成值',
      'delta': '气运变化量',
    },
  },
  'faith': {
    label: '信仰',
    fields: {
      'devotionLevel': '虔诚等级（0-100）',
      'delta': '虔诚变化量',
    },
  },
  'family': {
    label: '家庭',
    fields: {
      'status': '家庭状态（stable/conflict/dispersed/reunited）',
      'members': '家庭成员数量变化',
    },
  },
  'education': {
    label: '教育',
    fields: {
      'level': '教育等级（0-10）',
      'progress': '学习进度（0-100）',
      'graduated': '是否毕业',
    },
  },
  'work': {
    label: '工作',
    fields: {
      'job': '职业名称',
      'income': '收入',
      'promotion': '是否晋升',
    },
  },

  // ── town 级（强者可见）────────────────────────────
  'economy': {
    label: '经济',
    fields: {
      'wealth': '财富变化量',
      'priceIndex': '物价指数（100=正常）',
      'activityLevel': '经济活动水平（0-1）',
      'socialClass': '社会阶层（noble/commoner/peasant/merchant/cultivator）',
    },
  },
  'reputation': {
    label: '声望',
    fields: {
      'fame': '声望值（0-100）',
      'delta': '声望变化量',
      'addFame': '知名度增量（±值）',
      'setFame': '设置知名度绝对值',
      'addReputation': '维度声望增量（需配合 dimension）',
      'dimension': '维度：military/political/academic/economic/moral/religious',
    },
  },
  'relationship': {
    label: '关系',
    fields: {
      'addRelation': '新增关系 [{name, type, affinity}]',
      'affinityDelta': '好感变化（±值）',
    },
  },
  'market': {
    label: '市场',
    fields: {
      'activityLevel': '市场活跃度（0-1）',
      'trend': '市场趋势（bullish/bearish/stable）',
    },
  },
  'population': {
    label: '人口',
    fields: {
      'total': '人口变化量',
      'growthRate': '增长率',
      'migrationDirection': '迁移方向（inward/outward/none）',
    },
  },
  'cultivation': {
    label: '修炼',
    fields: {
      'realm': '修炼境界（1-9：炼气→大乘）',
      'cultivationProgress': '修炼进度（0-100）',
      'bottleneck': '瓶颈（physique/mind/comprehension/none）',
    },
  },
  'combat-power': {
    label: '战力',
    fields: {
      'rank': '战力等级（0-100）',
      'delta': '战力变化量',
    },
  },
}

/**
 * 将注册表格式化为 Prompt 注入文本
 * @deprecated 已迁移至 System Prompt 的 subsystemGuide 字段，由叙事 prompts 直接定义。本函数保留仅供调试用途，不应再在运行时使用。
 */
export function formatSubsystemFieldsForPrompt(_limitToIds?: string[]): string {
  return '' // 已废弃：不再注入 User Prompt
}

// ============================================================
// Zod 校验 Schema（AI changes 合法性验证）
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

/**
 * 各子系统的变更 Schema（passthrough 允许 AI 输出额外字段但会被 strip）
 * 仅验证类型和范围，不强制所有字段都存在。
 */
export const SUBSYSTEM_CHANGE_SCHEMAS: Record<string, z.ZodObject<z.ZodRawShape>> = {
  'character-base': z.object({
    physique: z.coerce.number().min(0).max(100).optional(),
    mind: z.coerce.number().min(0).max(100).optional(),
    comprehension: z.coerce.number().min(0).max(100).optional(),
    charisma: z.coerce.number().min(0).max(100).optional(),
    background: z.coerce.number().min(0).max(100).optional(),
  }).passthrough(),

  'health': z.object({
    hpDelta: z.coerce.number().min(-50).max(20).optional(),
    staminaDelta: z.coerce.number().optional(),
    spiritDelta: z.coerce.number().optional(),
    addDiseases: z.array(ailmentEntry).optional(),
    addInjuries: z.array(ailmentEntry).optional(),
  }).passthrough(),

  'lifespan': z.object({
    age: z.coerce.number().min(0).optional(),
    lifespanDelta: z.coerce.number().optional(),
    maxAge: z.coerce.number().min(0).optional(),
  }).passthrough(),

  'morality': z.object({
    value: z.coerce.number().min(-100).max(100).optional(),
    delta: z.coerce.number().optional(),
  }).passthrough(),

  'luck': z.object({
    bonus: z.coerce.number().optional(),
    delta: z.coerce.number().optional(),
  }).passthrough(),

  'faith': z.object({
    devotionLevel: z.coerce.number().min(0).max(100).optional(),
    delta: z.coerce.number().optional(),
  }).passthrough(),

  'family': z.object({
    status: z.enum(['stable', 'conflict', 'dispersed', 'reunited']).optional(),
    members: z.coerce.number().optional(),
  }).passthrough(),

  'education': z.object({
    level: z.coerce.number().min(0).max(10).optional(),
    progress: z.coerce.number().min(0).max(100).optional(),
    graduated: z.boolean().optional(),
  }).passthrough(),

  'work': z.object({
    job: z.string().optional(),
    income: z.coerce.number().optional(),
    promotion: z.boolean().optional(),
  }).passthrough(),

  'economy': z.object({
    wealth: z.coerce.number().optional(),
    priceIndex: z.coerce.number().optional(),
    activityLevel: z.coerce.number().min(0).max(1).optional(),
    socialClass: z.enum(['noble', 'commoner', 'peasant', 'merchant', 'cultivator']).optional(),
  }).passthrough(),

  'reputation': z.object({
    fame: z.coerce.number().min(0).max(100).optional(),
    delta: z.coerce.number().optional(),
    addFame: z.coerce.number().optional(),
    setFame: z.coerce.number().optional(),
    addReputation: z.coerce.number().optional(),
    dimension: z.string().optional(),
  }).passthrough(),

  'relationship': z.object({
    addRelation: z.array(relationEntry).optional(),
    affinityDelta: z.coerce.number().optional(),
  }).passthrough(),

  'market': z.object({
    activityLevel: z.coerce.number().min(0).max(1).optional(),
    trend: z.enum(['bullish', 'bearish', 'stable']).optional(),
  }).passthrough(),

  'population': z.object({
    total: z.coerce.number().optional(),
    growthRate: z.coerce.number().optional(),
    migrationDirection: z.enum(['inward', 'outward', 'none']).optional(),
  }).passthrough(),

  'cultivation': z.object({
    realm: z.coerce.number().min(1).max(9).optional(),
    cultivationProgress: z.coerce.number().min(0).max(100).optional(),
    bottleneck: z.enum(['physique', 'mind', 'comprehension', 'none']).optional(),
  }).passthrough(),

  'combat-power': z.object({
    rank: z.coerce.number().min(0).max(100).optional(),
    delta: z.coerce.number().optional(),
  }).passthrough(),

  'fate-prophecy': z.object({
    prophecy: z.string().optional(),
    deadline: z.coerce.number().optional(),
    triggerCondition: z.string().optional(),
  }).passthrough(),
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
