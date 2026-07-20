/**
 * @module types.ts
 * @description MOD 类型定义 —— 角色系统（4 基础属性 + 命格 + 健康 + 寿命 + 生命阶段 + 年龄衰减 + 善恶值）
 * @mod mod-character
 */

// ============================================================
// 基础属性（4 项）
// ============================================================

/** 4 项基础属性（luck -> LuckSystem, reputation -> ReputationSystem, health -> HealthSystem, morality -> MoralitySystem） */
export interface BaseAttributes {
  /** 体魄：影响 HP 恢复、体力上限、抗病 */
  physique: number
  /** 心智：影响学习效率、技能上限、谋略 */
  mind: number
  /** 悟性：天赋悟性，影响修炼 / 顿悟概率 */
  talentAptitude: number
  /** 魅力：外貌魅力，影响社交 / 关系品质 */
  charisma: number
}

/** 属性修正（来自命格 / 伤病 / 衰减的叠加） */
export interface AttributeModifiers {
  physique: number
  mind: number
  talentAptitude: number
  charisma: number
}

/** 基础属性子系统状态 */
export interface CharacterBaseState {
  /** 初始属性（不可变，来自角色创建时的分配） */
  base: BaseAttributes
  /** 当前属性（= base + modifiers，按超凡属性规则钳制） */
  current: BaseAttributes
  /** 聚合修正值（命格 bonus + 伤病 effects + 衰减 modifiers） */
  modifiers: AttributeModifiers
  /** 当地世界、种族或状态规则按 contextId/sourceId 分区，不污染其他世界 */
  contextModifiers: Record<string, Record<string, Partial<AttributeModifiers>>>
  /** 起始年龄（由角色创建或结构化变更显式提供） */
  startingAge: number,
}

// ============================================================
// 命格（对齐废弃项目 Talent -> 重命名为 DestinyPattern）
// ============================================================

/** 稀有度等级（对齐废弃项目 TalentRarity） */
export type DestinyPatternRarity = 'common' | 'fine' | 'rare' | 'epic' | 'legendary'

/** 命格极性 */
export type DestinyPatternPolarity = 'positive' | 'negative' | 'mixed'

/** 单条命格 */
export interface DestinyPattern {
  id: string
  name: string
  description: string
  rarity: DestinyPatternRarity
  polarity: DestinyPatternPolarity
  /** 效果描述文本（语义约束，注入叙事 Prompt 确保 AI 描述匹配） */
  effect: string
  /** 属性加成（钳制 [-4, 4]） */
  attrBonus: Partial<AttributeModifiers>,
  /** 模拟系统系数微调（乘法叠加，默认 1.0；稀有度越高可携带越多） */
  systemModifiers?: Partial<Record<string, number>>,
}

/** AI 命格输入（供外部 AI 数据传入 generateFromAI 方法） */
export interface DestinyPatternInput {
  name: string
  description: string
  rarity: DestinyPatternRarity
  polarity: DestinyPatternPolarity
  /** 效果描述文本 */
  effects: string
  /** 属性加成（可选） */
  attrBonus?: Partial<AttributeModifiers>,
  /** 模拟系统系数微调（可选，运行时仍按白名单与稀有度裁剪） */
  systemModifiers?: Partial<Record<string, number>>,
}

/** 一生结算时由 AI 生成的神话词条候选。纯概念规则，不携带属性或模拟系数。 */
export interface MythicPatternCandidate {
  /** 神话词条名称，如“未熄之诺” */
  name: string
  /** 概念标签，如“承诺” */
  concept: string
  /** 下一局叙事持续遵守的非数值概念规则 */
  effect: string
}

/** 神话词条的来源元数据；只用于总库追溯，不参与效果判定。 */
export interface MythicPatternSource {
  worldName: string
  characterName: string
  finalAge?: number
  /** 当前人生的稳定标识，用于保证同一人生最多封存一个神话词条。 */
  runId?: string
}

/** 已封存到跨局总库的神话词条。 */
export interface MythicPattern extends MythicPatternCandidate {
  /** 由本地内容身份生成的稳定 ID，AI 不负责生成。 */
  id: string
  acquiredAt: number
  source: MythicPatternSource
}

/** 命格子系统状态 */
export interface DestinyPatternState {
  /** 候选命格列表（抽5后暂存，待玩家选3） */
  candidates: DestinyPattern[]
  /** 角色持有的命格列表（选3后确认） */
  patterns: DestinyPattern[]
  /** 稀有度统计 */
  rarityCount: Record<DestinyPatternRarity, number>,
}

// ============================================================
// 健康伤病（对齐废弃项目 HealthStatus）
// ============================================================

/** 疾病 */
export interface Disease {
  id: string
  name: string
  /** 严重度 1-10 */
  severity: number
  /** 剩余持续轮次 */
  remainingRounds: number
  /** 对属性的影响 */
  attrEffects: Partial<AttributeModifiers>
  /** 是否传染 */
  contagious: boolean
  /** 治愈条件描述 */
  cureCondition: string,
}

/** 伤势 */
export interface Injury {
  id: string
  name: string
  /** 受伤部位 */
  bodyPart: string
  /** 严重度 1-10 */
  severity: number
  /** 剩余恢复轮次 */
  remainingRecoveryRounds: number
  /** 对属性的影响 */
  attrEffects: Partial<AttributeModifiers>
  /** 是否留下永久疤痕 */
  permanentScar: boolean,
}

/** 健康子系统状态 */
export interface HealthState {
  /** 生命值 0-100，归零 = 死亡 */
  hp: number
  /** 最大生命值 */
  maxHp: number
  /** 体力 0-100 */
  stamina: number
  /** 精神 0-100（初始 80，向 50 自然漂移，受魅力修正） */
  spirit: number
  /** 活跃疾病列表 */
  diseases: Disease[]
  /** 活跃伤势列表 */
  injuries: Injury[]
  /** 是否已死亡 */
  isDead: boolean
  /** 死亡原因 */
  deathCause?: string
}

// ============================================================
// 寿命（对齐废弃项目 LifespanConfig + BreakthroughCondition）
// ============================================================

/** 种族寿命配置 */
export interface RaceLifespanConfig {
  /** 种族名称 */
  name: string
  /** 基础最大寿命 */
  baseMaxAge: number
  /** 黄金年龄占比（如 [0.18, 0.40] = 18%~40% 寿命为黄金年龄） */
  goldenAgeRatio: [number, number]
  /** 衰减速率乘数（1.0 = 标准人类速率） */
  decayMultiplier: number
  /** 可超凡属性的物种基准线。未设置时默认 0，等同现状 */
  attrBaselines?: Partial<Record<'physique' | 'mind' | 'talentAptitude' | 'charisma', number>>,
}

/** 突破途径 */
export type BreakthroughPathway =
  | 'rareElixir'
  | 'cultivation'
  | 'divineBlessing'
  | 'forbiddenRitual'
  | 'techEnhancement'
  | 'ancientArtifact'

/** 突破记录 */
export interface BreakthroughRecord {
  pathway: BreakthroughPathway
  year: number
  /** 增加的年数 */
  yearsGained: number
  description: string,
}

/** 寿命子系统状态 */
export interface LifespanState {
  /** 当前最大寿命 */
  maxAge: number
  /** 基础最大寿命（不含突破加成） */
  baseMaxAge: number
  /** 当前种族配置 */
  race: RaceLifespanConfig
  /** 突破记录列表 */
  breakthroughs: BreakthroughRecord[]
  /** 当前突破概率（每次突破后递减） */
  breakthroughChance: number,
}

// ============================================================
// 生命阶段（对齐废弃项目 getLifeStageFromAge）
// ============================================================

/** 8 个生命阶段 */
export type LifeStageId =
  | 'infant'
  | 'child'
  | 'teenager'
  | 'young_adult'
  | 'adult'
  | 'middle_age'
  | 'elder'
  | 'deceased'

/** 生命阶段配置 */
export interface LifeStageConfig {
  id: LifeStageId
  /** AI 适配后的显示名称 */
  displayName: string
  /** 年龄范围（基于种族最大寿命比例或绝对年龄） */
  ageRange: [number, number]
  /** 阶段系数（对齐废弃项目 vitality/learning/social） */
  coefficients: {
    /** 活力系数（影响体魄 / 体力相关） */
    vitality: number
    /** 学习效率系数 */
    learning: number
    /** 社交系数 */
    social: number,
  }
  /** 该阶段易触发的事件关键词 */
  eventPool: string[]
  /** 该阶段规避的事件关键词 */
  avoidancePool: string[],
}

/** 生命阶段子系统状态 */
export interface LifeStageState {
  /** 当前阶段 ID */
  currentStage: LifeStageId
  /** 8 个阶段的完整配置（含 AI 适配后的名称） */
  stages: Record<LifeStageId, LifeStageConfig>
  /** 是否已完成 AI 适配初始化 */
  adapted: boolean,
}

// ============================================================
// 年龄衰减（对齐废弃项目 AgeDecayConfig）
// ============================================================

/** 衰减子系统状态 */
export interface AttributeDecayState {
  /** 四属性当前修正值（钳制 [-10, 10]） */
  modifiers: {
    physique: number
    mind: number
    talentAptitude: number
    charisma: number,
  }
  /** 黄金年龄区间 [start, end]（按 maxAge 比例缩放） */
  goldenAgeRange: [number, number]
  /** 是否已在衰减阶段 */
  isDecaying: boolean
  /** 当前寿命阶段提示文本 */
  stageHint: string,
}

// ============================================================
// 善恶值（对齐废弃项目 extractMoralityChanges）
// ============================================================

/** 7 档善恶映射（对齐废弃项目小范围阈值） */
export type MoralityLevel =
  | 'supremeGood'
  | 'greatGood'
  | 'good'
  | 'balanced'
  | 'evilLeaning'
  | 'greatEvil'
  | 'supremeEvil'

/** 善恶子系统状态 */
export interface MoralityState {
  /** 善恶值（负 = 恶，正 = 善） */
  value: number
  /** 当前善恶档位 */
  level: MoralityLevel
  /** 本轮变化 */
  roundDelta: number,
}

// ============================================================
// 角色汇总
// ============================================================

/** 角色完整信息（聚合 7 个子系统） */
export interface CharacterSummary {
  name: string
  gender: string
  age: number
  startingAge: number
  base: CharacterBaseState
  destinyPatterns: DestinyPatternState
  health: HealthState
  lifespan: LifespanState
  lifeStage: LifeStageState
  decay: AttributeDecayState
  morality: MoralityState,
}

// ============================================================
// 死后尾声（对齐废弃项目 post-death-epilogue-system）
// ============================================================

// ============================================================
// 气运（隐藏基础属性，用户不可见，仅 AI 叙事可读写；对齐废弃项目 luck-system.ts）
// ============================================================

/** 气运修正系数（气运值 → 四项全局系数） */
export interface LuckModifiers {
  /** 疾病回避概率修正（每点 +3%） */
  diseaseAvoidance: number
  /** 死亡回避概率修正（每点 +2%） */
  deathAvoidChance: number
  /** 叙事事件权重偏移（每点 +5%） */
  eventWeightBias: number
  /** 衰老加速修正（每点 -1%） */
  ageDecayModifier: number
}

/** 气运子系统状态 */
export interface LuckState {
  /** 气运值（-10~+10，0 为普通；负值不祥，正值走运） */
  luck: number
  /** 气运修正系数 */
  modifiers: LuckModifiers
  /** 大幅变化通知剩余轮数 */
  luckNotificationRounds: number
  /** 大幅变化通知文本 */
  luckNotificationText: string
}

// ============================================================
// 死因类型
// ============================================================

/** 7 种死因（对齐废弃项目 death-constants.ts） */
export type DeathCause =
  | 'old_age'
  | 'illness'
  | 'battle'
  | 'accident'
  | 'murder'
  | 'catastrophe'
  | 'unknown'

/** 死后尾声子系统状态 */
export interface PostDeathEpilogueState {
  /** 是否已生成尾声 */
  hasEpilogue: boolean
  /** AI 生成的尾声文本 */
  epilogueText: string
  /** 生成时间戳 */
  generatedAt: number
  /** 角色名 */
  characterName: string
  /** 享年 */
  finalAge: number
  /** 世界名称 */
  worldName: string
  /** 死因（从 health subsystem 提取，供导出格式使用） */
  deathCause?: string
  /** 角色性别（从 UI 选择传入） */
  gender?: string
  /** 角色种族（从 lifespan subsystem 提取） */
  race?: string
  /** 角色背景（从 UI 选择传入） */
  background?: string
  /** 一生事件总数（供导出页脚统计） */
  eventCount?: number
}

