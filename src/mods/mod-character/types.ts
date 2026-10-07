/**
 * Purpose: Define character identity, attributes, destiny patterns, and reincarnation talent contracts.
 * Owner: mod-character
 * Responsibility: Type declarations only; runtime validation and persistence remain with their owners.
 */

import type {
  CharacterBiologicalClockMode,
  CharacterNarrativeStatus,
} from '@/foundation'

export type {
  CharacterBiologicalClockMode,
  CharacterConditionState,
  CharacterDeathCauseKind,
  CharacterDeathOutcome,
  CharacterFortuneLevel,
  CharacterFortuneState,
  CharacterHealthState,
  CharacterLifeStageDefinition,
  CharacterNarrativeStatus,
  PendingCharacterDeath,
} from '@/foundation'

// ============================================================
// 基础属性（4 项）
// ============================================================

/** 4 项基础属性；气运由角色状态独立持有。 */
export interface BaseAttributes {
  /** 心智：影响学习效率、技能上限、谋略 */
  mind: number
  /** 体魄：影响生命恢复、体力上限、抗病 */
  physique: number
  /** 魅力：外貌魅力，影响社交 / 关系品质 */
  charisma: number
  /** 财富：影响起始资源、家庭支持与可获得的生活条件 */
  familyBackground: number
}

/** 属性修正（来自命格、生命周期、伤病与上下文规则的叠加） */
export interface AttributeModifiers {
  mind: number
  physique: number
  charisma: number
  familyBackground: number
  /** 天赋可提供的稀有气运修正；不参与四项基础属性聚合。 */
  luck?: number
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
  startingAge: number
  /** 角色状态唯一运行投影；由 character-base 初始化并持久化。 */
  status?: CharacterNarrativeStatus
}

// ============================================================
// 命格（对齐废弃项目 Talent -> 重命名为 DestinyPattern）
// ============================================================

/** 稀有度等级（对齐废弃项目 TalentRarity；`mythic` 仅由结算升阶产生，局内成长仍封顶 `legendary`） */
export type DestinyPatternRarity = 'common' | 'fine' | 'rare' | 'epic' | 'legendary' | 'mythic'

/** 命格所属的主要作用机制；轮回天赋沿用同一分类契约。 */
export type DestinyPatternCategory = 'action' | 'cognition' | 'expression' | 'stewardship' | 'misc'

/** 命格成长路线。 */
export type DestinyPatternGrowthRoute = '深度强化' | '广度强化' | '转变强化'

/** 单条命格 */
export interface DestinyPattern {
  /** 跨改名与升级保持不变的本地成长身份。 */
  lineageId: string
  /** 当前血脉版本；开局为 1，每次玩家确认升级后递增。 */
  version: number
  id: string
  name: string
  description: string
  category: DestinyPatternCategory
  rarity: DestinyPatternRarity
  /** 效果描述文本（语义约束，注入叙事 Prompt 确保 AI 描述匹配） */
  effect: string
  /** 属性加成；等级总量由 Prompt 提议并由 mod-character 在本地提交前校验。 */
  attrBonus: Partial<AttributeModifiers>
}

/** 天赋成长 AI 只负责提供的内容方向。 */
export interface DestinyPatternGrowthDirection {
  route: DestinyPatternGrowthRoute
  name: string
  description: string
  effect: string
  attrBonus: Partial<AttributeModifiers>
}

/** 局内成长可作用于普通命格或已携带的轮回天赋；两者共用同一条血脉。 */
export type DestinyPatternGrowthSource = DestinyPattern | ReincarnationTalent

/** 已由本地补齐等级、身份与版本的单个下一阶方向。 */
export interface DestinyPatternGrowthOption {
  optionId: string
  route: DestinyPatternGrowthRoute
  pattern: DestinyPatternGrowthSource
}

/** 玩家必须处理的单次命格成长三选一。 */
export interface PendingDestinyPatternGrowth {
  choiceId: string
  narrativeId: string
  roundSequence: number
  lineageId: string
  source: DestinyPatternGrowthSource
  options: [DestinyPatternGrowthOption, DestinyPatternGrowthOption, DestinyPatternGrowthOption]
}

/** 已确认的命格成长路线记录。 */
export interface DestinyPatternGrowthHistoryEntry {
  choiceId: string
  narrativeId: string
  roundSequence: number
  lineageId: string
  selectedOptionId: string
  source: DestinyPatternGrowthSource
  result: DestinyPatternGrowthSource
  committedAt: number
  /** 本次成长确认时的年度基础点，用于程序冷却判定。 */
  totalBasePoints?: number
  /** 派生日历快照；仅用于显示和旧存档迁移。 */
  totalDays: number
}

/** 主故事同次响应记录的单个命格表现窗口。 */
export interface DestinyPatternGrowthEvidence {
  lineageId: string
  sourceRound: number
  usage: string
  result: string
  breakthrough?: string
}

/** 单条命格最近一次已经交给成长 AI 复评到的证据水位。 */
export interface DestinyPatternGrowthAssessment {
  lineageId: string
  evaluatedThroughRound: number
  evaluatedBreakthroughRound?: number
}

/** AI 命格输入（供外部 AI 数据传入 generateFromAI 方法） */
export interface DestinyPatternInput {
  name: string
  description: string
  category: DestinyPatternCategory
  /** 效果描述文本 */
  effects: string
  /** 属性加成（可选） */
  attrBonus?: Partial<AttributeModifiers>
}

/** 轮回天赋的来源元数据；只用于总库追溯，不参与效果判定。 */
export interface ReincarnationTalentSource {
  worldName: string
  characterName: string
  finalAge?: number
  /** 当前人生的稳定标识，用于追溯升阶来源。 */
  runId?: string
}

/** 结算升阶后写入跨世界轮回库的命格式词条；同一 lineageId 只保留最新版本。 */
export interface ReincarnationTalent {
  /** 由本地 lineageId 稳定派生的词条 ID。 */
  id: string
  /** 与来源命格一致的稳定成长身份，用于替换旧版本。 */
  lineageId: string
  /** 血脉版本；每次升阶 +1。 */
  version: number
  name: string
  description: string
  category: DestinyPatternCategory
  rarity: DestinyPatternRarity
  /** 跨局持续生效的非数值概念规则。 */
  effect: string
  attrBonus: Partial<AttributeModifiers>
  /** 强化等级；非 mythic 为 0，首次升到 mythic 仍为 0，神话强化后按程序结果变化。 */
  strengthenLevel: number
  acquiredAt: number
  source: ReincarnationTalentSource
}

/** 命格子系统状态 */
export interface DestinyPatternState {
  /** 当前命格抽取候选池；首批为五类各四条，后台最多补充到每类十二条。 */
  candidates: DestinyPattern[]
  /** 角色在共享携带槽中选择的普通命格。 */
  patterns: DestinyPattern[]
  /** 稀有度统计 */
  rarityCount: Record<DestinyPatternRarity, number>,
  /** 当前等待玩家选择的下一阶方向。 */
  pendingGrowth: PendingDestinyPatternGrowth | null
  /** 本局完整命格成长路线。 */
  growthHistory: DestinyPatternGrowthHistoryEntry[]
  /** 由主故事表现线索形成的、按血脉与来源回合去重的证据窗口。 */
  growthEvidence: DestinyPatternGrowthEvidence[]
  /** 每条血脉最近一次成长 AI 已复评到的证据水位。 */
  growthAssessments: DestinyPatternGrowthAssessment[]
}

// ============================================================
// 创建草稿与运行时 UI 投影
// ============================================================

/** 角色创建使用的结构化种族与寿命输入；运行时由 character-base 接管。 */
export interface RaceLifespanConfig {
  name: string
  baseLifespanYears: number
  clockMode: CharacterBiologicalClockMode
  attrBaselines?: Partial<AttributeModifiers>
}

export interface LifespanDraftState {
  raceId: string
  race: RaceLifespanConfig
  maximumLifespanYears: number
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
  status?: CharacterNarrativeStatus
}
