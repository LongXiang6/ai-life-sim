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
 * 契约外字段与类型/范围不合法项均拒绝；消费方必须整包拒绝本轮 AI 系统指令。
 */

import { z } from 'zod'
import {
  GROWTH_SYSTEM_OPERATION_FIELDS,
  HEALTH_SYSTEM_OPERATION_FIELDS,
  LIFESPAN_SYSTEM_OPERATION_FIELDS,
  NPC_SYSTEM_OPERATION_FIELDS,
  RELATIONSHIP_SYSTEM_OPERATION_FIELDS,
  REPUTATION_SYSTEM_OPERATION_FIELDS,
  type SubSystemChanges,
} from '@/foundation'

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
  /** Internal operation name to the single Chinese protocol operation label. */
  operationLabels?: Record<string, string>
  /** Exact internal payload keys accepted by each operation. */
  operationFields?: Record<string, readonly string[]>
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

const characterAttributeModifiers = z.object({
  physique: z.number().int().optional(),
  mind: z.number().int().optional(),
  talentAptitude: z.number().int().optional(),
  charisma: z.number().int().optional(),
}).strict()

const decimalIntegerSchema = z.string().regex(/^(0|[1-9]\d*)$/u, '必须是非负十进制整数字符串')

export const SUBSYSTEM_FIELD_CONTRACTS: Record<string, SubsystemFieldContract> = {
  // ── P0 多世界基础（不扩大 systemInstruction 白名单）────────────
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
    operationFields: {
      增量: ['physiqueDelta', 'mindDelta', 'talentAptitudeDelta', 'charismaDelta'],
    },
    fields: {
      physiqueDelta: {
        aiName: '体魄变化',
        description: '整数；正为增长，负为下降；建议单轮不超过2，协议范围为-8至8',
        schema: z.number().int().min(-8).max(8).optional(),
      },
      mindDelta: {
        aiName: '心智变化',
        description: '整数；正为增长，负为下降；建议单轮不超过2，协议范围为-8至8',
        schema: z.number().int().min(-8).max(8).optional(),
      },
      talentAptitudeDelta: {
        aiName: '悟性变化',
        description: '整数；正为增长，负为下降；建议单轮不超过2，协议范围为-8至8',
        schema: z.number().int().min(-8).max(8).optional(),
      },
      charismaDelta: {
        aiName: '魅力变化',
        description: '整数；正为增长，负为下降；建议单轮不超过2，协议范围为-8至8',
        schema: z.number().int().min(-8).max(8).optional(),
      },
    },
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
      description: { aiName: '描述', description: '已经在本轮叙事中成立的技能或能力说明', schema: z.string().min(1).max(300).optional() },
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
  'health': {
    label: '健康',
    aiName: '健康',
    aiAuthority: 'validated-write',
    allowedScopes: ['active-context', 'explicit-context'],
    operations: ['adjust-vitals', 'add-condition', 'resolve-condition'],
    operationLabels: {
      'adjust-vitals': '调整状态',
      'add-condition': '新增伤病',
      'resolve-condition': '解决伤病',
    },
    operationFields: HEALTH_SYSTEM_OPERATION_FIELDS,
    fields: {
      vitalityDelta: {
        aiName: '生命状态变化',
        description: '整数；本轮明确事实造成的生命状态变化，正为恢复、负为损伤',
        schema: z.number().int().min(-100000).max(100000).optional(),
      },
      staminaDelta: {
        aiName: '体力变化',
        description: '整数；本轮明确事实造成的体力变化',
        schema: z.number().int().min(-100000).max(100000).optional(),
      },
      spiritDelta: {
        aiName: '精神变化',
        description: '整数；本轮明确事实造成的精神变化',
        schema: z.number().int().min(-100000).max(100000).optional(),
      },
      conditionKind: {
        aiName: '伤病类型',
        description: 'disease、injury、systemic 或 other',
        schema: z.enum(['disease', 'injury', 'systemic', 'other']).optional(),
      },
      conditionName: {
        aiName: '伤病名称',
        description: '本轮已经成立的非空伤病名称',
        schema: z.string().trim().min(1).max(100).optional(),
      },
      bodyPart: { aiName: '身体部位', description: '可选的明确受影响部位', schema: z.string().trim().min(1).max(60).optional() },
      severity: { aiName: '严重度', description: '整数 1 至 10', schema: z.number().int().min(1).max(10).optional() },
      recoveryDays: { aiName: '恢复天数', description: '正整数；伤病按规范天数恢复', schema: z.number().int().min(1).optional() },
      attributeModifiers: { aiName: '属性修正', description: '伤病存续期间对体魄、心智、悟性、魅力的整数修正对象', schema: characterAttributeModifiers.optional() },
      conditionTags: { aiName: '伤病标签', description: '描述伤病机制的非空标签数组', schema: z.array(z.string().trim().min(1)).optional() },
      resolution: { aiName: '解决说明', description: '伤病已被解决的事实说明', schema: z.string().trim().min(1).max(300).optional() },
    },
  },
  'lifespan': {
    label: '寿命',
    aiName: '寿命',
    aiAuthority: 'validated-write',
    allowedScopes: ['global', 'active-context'],
    operations: ['adjust-maximum', 'set-rule'],
    operationLabels: {
      'adjust-maximum': '调整上限',
      'set-rule': '设置规则',
    },
    operationFields: LIFESPAN_SYSTEM_OPERATION_FIELDS,
    fields: {
      maximumDaysDelta: {
        aiName: '寿命上限天数变化',
        description: '非零整数；只在已确认事件明确改变寿命上限时填写，正为增加、负为减少',
        schema: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).refine((value) => value !== 0).optional(),
      },
      raceId: { aiName: '种族规则ID', description: '稳定的 ASCII 种族或形态规则 ID', schema: z.string().trim().min(1).max(100).optional() },
      raceDisplayName: { aiName: '种族显示名', description: '种族或形态的显示名称', schema: z.string().trim().min(1).max(100).optional() },
      clockMode: { aiName: '生物钟模式', description: 'aging、ageless、cyclic 或 external', schema: z.enum(['aging', 'ageless', 'cyclic', 'external']).optional() },
      baseLifespanDays: { aiName: '基础寿命天数', description: '正整数；规则的基础寿命，单位为规范天', schema: z.number().int().min(1).optional() },
      maximumLifespanDays: { aiName: '寿命上限天数', description: '正整数；规则的当前寿命上限，单位为规范天', schema: z.number().int().min(1).optional() },
      attrBaselines: { aiName: '属性基线', description: '种族或形态对体魄、心智、悟性、魅力的整数基线对象', schema: characterAttributeModifiers.optional() },
    },
  },
  'morality': {
    label: '道德',
    aiName: '道德',
    aiAuthority: 'validated-write',
    allowedScopes: ['global'],
    operations: ['增量'],
    operationFields: { 增量: ['delta'] },
    fields: {
      delta: {
        aiName: '道德变化',
        description: '善恶变化量（整数；+1=趋善，-1=趋恶；单次仅重大行为可写）',
        schema: z.number().int().min(-1).max(1).optional(),
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
        description: '本轮收入；使用非负十进制整数字符串，避免大数精度丢失',
        schema: decimalIntegerSchema.optional(),
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
        description: '财富绝对值；使用非负十进制整数字符串，避免大数精度丢失',
        schema: decimalIntegerSchema.optional(),
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
    label: '分域声望',
    aiName: '分域声望',
    aiAuthority: 'validated-write',
    allowedScopes: ['active-context', 'explicit-context'],
    operations: ['adjust'],
    operationLabels: { adjust: '调整' },
    operationFields: REPUTATION_SYSTEM_OPERATION_FIELDS,
    fields: {
      scopeKind: { aiName: '评价域类型', description: 'entity、context 或 global', schema: z.enum(['entity', 'context', 'global']).optional() },
      evaluatorEntityId: { aiName: '评价实体', description: 'entity 评价域必填；使用已登记且在当前上下文可见的稳定实体 ID', schema: z.string().min(1).optional() },
      scopeContextId: { aiName: '评价上下文', description: 'context 评价域使用当前稳定上下文 ID', schema: z.string().min(1).optional() },
      dimension: { aiName: '评价维度', description: '本轮事实实际影响的中性评价维度', schema: z.string().min(1).max(60).optional() },
      delta: { aiName: '评价变化', description: '非零整数变化，调整后维度分数须位于 -100 至 100', schema: z.number().int().min(-100).max(100).optional() },
    },
  },
  'npc-system': {
    label: 'NPC 系统',
    aiName: 'NPC系统',
    aiAuthority: 'validated-write',
    allowedScopes: ['active-context', 'explicit-context'],
    operations: ['create-identity', 'set-context-state', 'set-goal', 'record-behavior', 'record-memory'],
    operationLabels: {
      'create-identity': '创建身份',
      'set-context-state': '设置当地状态',
      'set-goal': '设定目标',
      'record-behavior': '记录行为',
      'record-memory': '记录记忆',
    },
    operationFields: NPC_SYSTEM_OPERATION_FIELDS,
    fields: {
      displayName: { aiName: '显示名', description: 'NPC 显示名', schema: z.string().min(1).optional() },
      creationSource: { aiName: '创建来源', description: '身份创建来源说明', schema: z.string().min(1).optional() },
      stableTraits: { aiName: '稳定特质', description: '稳定特质标签数组', schema: z.array(z.string().min(1)).optional() },
      localName: { aiName: '当地称呼', description: '当前上下文中的称呼', schema: z.string().optional() },
      stance: { aiName: '立场', description: '当前上下文立场', schema: z.string().optional() },
      role: { aiName: '角色', description: '当前上下文角色', schema: z.string().optional() },
      localRuleModifiers: { aiName: '当地规则修正', description: '当地规则修正数字表', schema: z.record(z.string(), z.number()).optional() },
      description: { aiName: '目标描述', description: 'NPC 目标描述', schema: z.string().min(1).optional() },
      targetEntityIds: { aiName: '目标实体', description: '已登记的全局实体 ID 数组', schema: z.array(z.string().min(1)).optional() },
      behaviorOperation: { aiName: '行为操作', description: '行为类型', schema: z.string().min(1).optional() },
      spatialNodeId: { aiName: '空间节点', description: '已登记的当前上下文空间节点 ID', schema: z.string().min(1).optional() },
      summary: { aiName: '主观摘要', description: 'NPC 主观记忆摘要', schema: z.string().min(1).optional() },
      emotion: { aiName: '情绪值', description: '整数情绪值（-10 至 10）', schema: z.number().int().min(-10).max(10).optional() },
      relatedEntityIds: { aiName: '关联实体', description: '已登记的关联实体 ID 数组', schema: z.array(z.string().min(1)).optional() },
      sourceMemoryIds: { aiName: '来源记忆', description: '已有来源记忆 ID 数组', schema: z.array(z.string().min(1)).optional() },
    },
  },
  'relationship-system': {
    label: '通用关系系统',
    aiName: '通用关系系统',
    aiAuthority: 'validated-write',
    allowedScopes: ['active-context', 'explicit-context'],
    operations: ['establish', 'adjust', 'end', 'scope-change'],
    operationLabels: {
      establish: '建立',
      adjust: '调整',
      end: '解除',
      'scope-change': '变更作用域',
    },
    operationFields: RELATIONSHIP_SYSTEM_OPERATION_FIELDS,
    fields: {
      toEntityId: { aiName: '目标实体', description: '已登记的目标实体 ID（建立关系时必填）', schema: z.string().min(1).optional() },
      categoryTags: { aiName: '关系类别', description: '中性关系类别标签数组', schema: z.array(z.string().min(1)).optional() },
      affinity: { aiName: '好感', description: '整数初始好感（-100 至 100）', schema: z.number().int().min(-100).max(100).optional() },
      trust: { aiName: '信任', description: '整数初始信任（0 至 100）', schema: z.number().int().min(0).max(100).optional() },
      bond: { aiName: '羁绊', description: '整数初始羁绊（0 至 100）', schema: z.number().int().min(0).max(100).optional() },
      conflict: { aiName: '冲突', description: '整数初始冲突（0 至 100）', schema: z.number().int().min(0).max(100).optional() },
      affinityDelta: { aiName: '好感变化', description: '整数好感变化量', schema: z.number().int().optional() },
      trustDelta: { aiName: '信任变化', description: '整数信任变化量', schema: z.number().int().optional() },
      bondDelta: { aiName: '羁绊变化', description: '整数羁绊变化量', schema: z.number().int().optional() },
      conflictDelta: { aiName: '冲突变化', description: '整数冲突变化量', schema: z.number().int().optional() },
      scopeKind: { aiName: '作用域类型', description: 'global/context/cross-context', schema: z.enum(['global', 'context', 'cross-context']).optional() },
      scopeContextIds: { aiName: '作用域上下文', description: '稳定上下文 ID 数组', schema: z.array(z.string().min(1)).optional() },
    },
  },
  'population': {
    label: '人口',
    fields: {
      total: {
        description: '人口绝对值；使用非负十进制整数字符串，避免百万、百亿及更大数量丢失精度',
        schema: decimalIntegerSchema.optional(),
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
      penaltyDelta: {
        description: '瓶颈惩罚变化量（-100 至 100）',
        schema: z.number().int().min(-100).max(100).optional(),
      },
      talentTags: {
        description: '训练天赋标签数组；只使用角色已存在的标签',
        schema: z.array(z.string().min(1)).optional(),
      },
      realmIndex: {
        description: '当前世界框架中的阶位索引，只读投影，不接受叙事写入',
        schema: z.number().int().min(0).optional(),
      },
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
      progressDelta: {
        description: '当前世界阶位内的力量进度变化量',
        schema: z.number().int().optional(),
      },
      rankId: {
        description: '当前世界力量框架中已存在的阶位 ID',
        schema: z.string().min(1).optional(),
      },
      label: {
        description: '当前世界阶位的新显示名称',
        schema: z.string().min(1).max(80).optional(),
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
  operations: Record<string, string>
  operationFields: Record<string, string[]>
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

  const operationFields: NarrativeAISubsystemContract['operationFields'] = {}
  for (const [operation, internalFieldNames] of Object.entries(contract.operationFields ?? {})) {
    if (!(contract.operations ?? []).includes(operation)) {
      throw new Error(`子系统 ${internalId} 的字段契约引用未知操作 ${operation}`)
    }
    operationFields[operation] = internalFieldNames.map((internalFieldName) => {
      const field = contract.fields[internalFieldName]
      if (!field?.aiName) {
        throw new Error(`子系统 ${internalId}.${operation} 引用未知或无中文名字段 ${internalFieldName}`)
      }
      return field.aiName
    })
  }

  return {
    internalId,
    aiName: contract.aiName,
    operations: Object.fromEntries(
      Object.entries(contract.operationLabels
        ?? Object.fromEntries((contract.operations ?? []).map((operation) => [operation, operation])))
        .map(([internalName, aiName]) => [internalName, aiName]),
    ),
    operationFields,
    fields,
  }
}

export function getNarrativeAISubsystemContracts(
  subsystemIds: Iterable<string>,
): NarrativeAISubsystemContract[] {
  return [...subsystemIds].map(getNarrativeAISubsystemContract)
}

/** 将 AI 中文系统名与字段名严格转回内部运行契约；未知项由调用方整包拒绝。 */
export function translateNarrativeAISystemInstructionToInternal(input: {
  systemName: string
  operation: string
  targetObjectId: string
  targetContextId: string
  evidenceEventIds?: string[]
  description: string
  fields: Record<string, unknown>
}, allowedSubsystemIds: Iterable<string>): SubSystemChanges {
  const contracts = getNarrativeAISubsystemContracts(allowedSubsystemIds)
  const contract = contracts.find((item) => item.aiName === input.systemName)
  if (!contract) {
    throw new Error(`未知或本轮不可写的中文子系统：${input.systemName}`)
  }

  const operation = contract.operations
    ? Object.entries(contract.operations).find(([, aiName]) => aiName === input.operation)?.[0]
    : input.operation
  if (!operation || (SUBSYSTEM_FIELD_CONTRACTS[contract.internalId].operations
    && !SUBSYSTEM_FIELD_CONTRACTS[contract.internalId].operations?.includes(operation))) {
    throw new Error(`子系统 ${input.systemName} 含未知标准操作：${input.operation}`)
  }

  const changes: Record<string, unknown> = {}
  const allowedOperationFields = contract.operationFields[operation]
  for (const [aiName, value] of Object.entries(input.fields)) {
    const field = contract.fields[aiName]
    if (!field) {
      throw new Error(`子系统 ${input.systemName} 含未知中文字段：${aiName}`)
    }
    if (allowedOperationFields && !allowedOperationFields.includes(aiName)) {
      throw new Error(`子系统 ${input.systemName} 的操作 ${input.operation} 不接受字段：${aiName}`)
    }
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

/**
 * 根据当前阶段的 systemInstruction 白名单生成给 AI 的字段指南。
 */
export function buildSubsystemGuide(subsystemIds: Iterable<string>): string {
  const lines: string[] = []
  for (const contract of getNarrativeAISubsystemContracts(subsystemIds)) {
    lines.push(`${contract.aiName}：`)
    const operationLabels = Object.values(contract.operations)
    if (operationLabels.length > 0) lines.push(`  标准操作只允许：${operationLabels.map((operation) => `“${operation}”`).join('、')}`)
    if (Object.keys(contract.operationFields).length > 0) {
      for (const [operation, aiName] of Object.entries(contract.operations)) {
        const allowedFields = contract.operationFields[operation]
        if (!allowedFields) continue
        lines.push(allowedFields.length > 0
          ? `  操作“${aiName}”的“变更”对象只允许键：${allowedFields.map((field) => `“${field}”`).join('、')}`
          : `  操作“${aiName}”的“变更”必须是空对象。`)
      }
    } else {
      lines.push(`  “变更”对象只允许键：${Object.values(contract.fields).map((field) => `“${field.aiName}”`).join('、')}`)
    }
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

  const contract = SUBSYSTEM_FIELD_CONTRACTS[change.id]
  const allowedOperationFields = change.operation
    ? contract.operationFields?.[change.operation]
    : undefined
  if (contract.operationFields && !allowedOperationFields) {
    console.warn(`[Validator] ${change.id} 含未知或缺失操作：${change.operation ?? ''}`)
    return null
  }
  if (allowedOperationFields) {
    const unexpectedFields = Object.keys(change.changes).filter((field) => !allowedOperationFields.includes(field))
    if (unexpectedFields.length > 0) {
      console.warn(`[Validator] ${change.id}.${change.operation} 含不适用字段：${unexpectedFields.join('、')}`)
      return null
    }
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
