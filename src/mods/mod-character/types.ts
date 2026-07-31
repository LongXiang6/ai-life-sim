/**
 * @module types.ts
 * @description MOD 类型定义 —— 角色系统（基础属性、命格、UI 投影与善恶值）
 * @mod mod-character
 */

import type {
  BiologicalClockMode,
  DeathOutcome,
  HealthCondition,
  LifespanAdjustment,
  LifecycleStageDefinition,
} from '@/foundation'

export type {
  LuckNarrativeDirection,
  LuckNarrativeGuidance,
  LuckModifiers,
  LuckState,
  LuckPersistenceState,
} from '@/foundation'

// ============================================================
// 基础属性（4 项）
// ============================================================

/** 4 项基础属性（luck -> LuckSystem, reputation -> ReputationSystem, health -> HealthSystem, morality -> MoralitySystem） */
export interface BaseAttributes {
  /** 体魄：影响生命恢复、体力上限、抗病 */
  physique: number
  /** 心智：影响学习效率、技能上限、谋略 */
  mind: number
  /** 悟性：天赋悟性，影响修炼 / 顿悟概率 */
  talentAptitude: number
  /** 魅力：外貌魅力，影响社交 / 关系品质 */
  charisma: number
}

/** 属性修正（来自命格、生命周期、伤病与上下文规则的叠加） */
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
  /** 聚合修正值（命格、生命周期、伤病及上下文修正） */
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

export type ReincarnationTalentStrengthTier = 'echo' | 'deep' | 'legacy' | 'immortal'

/** 一生结算时由 AI 生成的轮回天赋候选。纯概念规则，不携带属性或模拟系数。 */
export interface MythicPatternCandidate {
  /** 轮回天赋名称，如“未熄之诺” */
  name: string
  /** 概念标签，如“承诺” */
  concept: string
  /** 下一局叙事持续遵守的非数值概念规则 */
  effect: string
  /** 由本地结算评分确定，AI 只按档位塑造效果。 */
  strengthTier?: ReincarnationTalentStrengthTier
  /** 生成本候选时使用的人生评分。 */
  sourceScore?: number
}

/** 轮回天赋的来源元数据；只用于总库追溯，不参与效果判定。 */
export interface MythicPatternSource {
  worldName: string
  characterName: string
  finalAge?: number
  /** 当前人生的稳定标识，用于保证同一人生最多封存一个轮回天赋。 */
  runId?: string
}

/** 已封存到跨局总库的轮回天赋。 */
export interface MythicPattern extends MythicPatternCandidate {
  /** 由本地内容身份生成的稳定 ID，AI 不负责生成。 */
  id: string
  acquiredAt: number
  source: MythicPatternSource
}

/** 命格子系统状态 */
export interface DestinyPatternState {
  /** 候选命格列表（定版展示 12 个，首屏达到 5 个即可先交接） */
  candidates: DestinyPattern[]
  /** 角色持有的命格列表（选3后确认） */
  patterns: DestinyPattern[]
  /** 稀有度统计 */
  rarityCount: Record<DestinyPatternRarity, number>,
}

// ============================================================
// 创建草稿与运行时 UI 投影
// ============================================================

/** 角色创建使用的结构化种族目录；运行时真源由 LifespanSystem 持有。 */
export interface RaceLifespanConfig {
  name: string
  baseLifespanYears: number
  clockMode: BiologicalClockMode
  attrBaselines?: Partial<AttributeModifiers>
}

export interface LifespanDraftState {
  raceId: string
  race: RaceLifespanConfig
  maximumLifespanYears: number
}

/** 非持久 UI 投影；不得作为健康运行态恢复来源。 */
export interface HealthProjection {
  entityId?: string
  vitality: number
  maxVitality: number
  stamina: number
  spirit: number
  alive: boolean
  conditions: HealthCondition[]
  death?: DeathOutcome
}

/** 非持久 UI 投影；完整寿命状态保存在 owning-system 快照。 */
export interface LifespanProjection {
  entityId?: string
  raceId: string
  displayName: string
  clockMode: BiologicalClockMode
  baseLifespanDays: number
  maximumLifespanDays: number
  adjustments: LifespanAdjustment[]
}

/** 非持久 UI 投影；阶段和属性修正均由 LifecycleSystem 当前值派生。 */
export interface LifecycleProjection {
  entityId?: string
  ageDays: number
  currentStage?: LifecycleStageDefinition
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

/** 角色当前 UI 汇总；运行时 owning state 不在此处持久化。 */
export interface CharacterSummary {
  name: string
  gender: string
  age: number
  startingAge: number
  base: CharacterBaseState
  destinyPatterns: DestinyPatternState
  health: HealthProjection
  lifespan: LifespanProjection
  lifecycle: LifecycleProjection
  morality: MoralityState,
}

// ============================================================
// 气运（隐藏基础属性，用户不可见；随机方向由本地 owning system 产生）
// ============================================================
