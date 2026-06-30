/**
 * @module types.ts
 * @description MOD 类型定义 —— 力量体系：战力、怪物、气运
 * @mod mod-power-system
 */

// ============================================================
// §1 战力（对齐废弃项目 CombatPowerState + CombatPowerConfig 常量类型）
// ============================================================

/** 子阶段索引 1~5 */
export type SubStageIndex = 1 | 2 | 3 | 4 | 5

/** 战力子系统状态 */
export interface CombatPowerState {
  /** 是否已初始化 */
  initialized: boolean
  /** 主阶段 1+（1~23 为固定阶，23+ 为动态无限阶） */
  mainStage: number
  /** 子阶段 1~5（初入/小成/大成/巅峰/登峰造极） */
  subStage: SubStageIndex
  /** 当前进度值 1~9999 */
  powerValue: number
  /** 战斗技能映射 { 技能名: 等级 } */
  combatSkills: Record<string, number>
  /** 世界力量上限等级（1-23），来自玩家自定义 */
  powerCeiling: number
  /** 世界力量上限标签 */
  powerCeilingLabel: string
  /** 顿悟剩余修炼次数，0=无顿悟效果 */
  insightRemaining: number
  /** AI 适配后的阶段名称映射 { 阶位: 名称 } */
  stageNames: Record<number, string>,
}

// ============================================================
// §2 怪物（对齐废弃项目 MonsterState + MonsterEncounterResult）
// ============================================================

/** 人口密度威胁影响方向 */
export type PopulationThreatDirection = 'repel' | 'attract'

/** 怪物子系统状态 */
export interface MonsterState {
  /** 是否已初始化 */
  initialized: boolean
  /** 是否启用（按世界观判定） */
  enabled: boolean
  /** 区域威胁等级 { 区域ID: 威胁等级0-100 } */
  regionalThreat: Record<string, number>
  /** 当前怪物种类列表 */
  monsterTypes: string[]
  /** 刷新频率 0-1 */
  spawnFrequency: number
  /** 人口密度对威胁影响方向：repel（人类压制 → -值）/ attract（吸引怪物 → +值） */
  populationThreatDirection: PopulationThreatDirection,
}

/** 怪物遭遇结果 */
export interface MonsterEncounterResult {
  /** 是否遭遇 */
  encounter: boolean
  /** 怪物类型 */
  monsterType: string
  /** 威胁等级 */
  threatLevel: number,
}

// ============================================================
// §3 气运（对齐废弃项目 LuckModifiers + LuckConfig 常量）
// ============================================================

/** 气运修正系数集合 */
export interface LuckModifiers {
  /** 疾病躲避概率修正（满 +30%） */
  diseaseAvoidance: number
  /** 死亡回避概率修正（满 +20%） */
  deathAvoidChance: number
  /** 叙事方向权重偏移（满 +50% 机遇偏移） */
  eventWeightBias: number
  /** 衰老衰减修正（满 +10% 加速 — 惩罚项） */
  ageDecayModifier: number,
}

/** 气运子系统状态 */
export interface LuckState {
  /** 当前运气值 0-10 */
  luck: number
  /** 四项修正系数 */
  modifiers: LuckModifiers
  /** 大幅运气变化通知剩余轮数（0=无通知） */
  luckNotificationRounds: number
  /** 大幅运气变化通知文本 */
  luckNotificationText: string,
}

// ============================================================
// §4 力量上限配置
// ============================================================

/** 力量上限配置（供世界自定义使用） */
export interface PowerCeilingConfig {
  /** 所选上限等级 1-23 */
  level: number
  /** 上限标签（如 "12阶"） */
  label: string
  /** 世界容器容量等级 */
  worldCapacity: number,
}

// ============================================================
// §5 机缘奇遇
// ============================================================

/** 奇遇品质 */
export type EncounterTier = 'legendary' | 'major' | 'minor'

/** 奇遇事件定义 */
export interface EncounterEvent {
  id: string
  tier: EncounterTier
  name: string
  description: string
  narrativeHint: string,
}

/** 机缘奇遇子系统状态 */
export interface FortuneEncounterState {
  initialized: boolean
  cooldownRounds: number
  lastTriggerEraYear: number
  totalEncounters: number
  activeEncounter: EncounterEvent | null
  lastEncounterId: string | null,
}

// ============================================================
// §6 信仰
// ============================================================

/** 信仰子系统状态 */
export interface FaithState {
  faithName: string | null
  devotionLevel: number
  yearsInFaith: number,
}

// ============================================================
// §7 至尊物品
// ============================================================

/** 至尊物品品质 */
export type SupremeTier = 'mythic' | 'legendary' | 'epic' | 'rare'

/** 觉醒触发条件类型 */
export type AwakeningTriggerType = 'round_count' | 'narrative_matches'

/** 觉醒触发条件 */
export interface AwakeningCondition {
  trigger: string,
}

/** 觉醒检测上下文 */
export interface AwakeningCheckContext {
  roundCount: number
  narrative?: string,
}

/** 至尊物品定义 */
export interface SupremeItem {
  id: string
  name: string
  description: string
  tier: SupremeTier
  worldview: string
  awakened: boolean
  awakeningCondition?: AwakeningCondition,
}

/** 至尊物品子系统状态 */
export interface SupremeItemState {
  initialized: boolean
  items: SupremeItem[],
}

// ============================================================
// §8 神明干预
// ============================================================

/** 神谕条目 */
export interface OracleEntry {
  id: string
  name: string
  hint: string
  turnsRemaining: number,
}

/** 神迹条目 */
export interface MiracleEntry {
  id: string
  name: string
  hint: string
  luckMod: number
  healthMod: number
  turnsRemaining: number,
}

/** 神明干预子系统状态 */
export interface DivineInterventionState {
  initialized: boolean
  enabled: boolean
  activeOracles: OracleEntry[]
  activeMiracles: MiracleEntry[]
  miracleCooldownTurns: number
  severity: number
  chosenOnes: string[],
}

// ============================================================
// §9 异常现象
// ============================================================

/** 异常区域严重度 */
export type AnomalySeverity = 'mild' | 'dangerous' | 'deadly'

/** 异常区域定义 */
export interface AnomalyZone {
  id: string
  name: string
  /** 区域描述文本（供 AI prompt） */
  description: string
  ruleDescription: string
  severity: AnomalySeverity
  x: number
  y: number
  spreadCount: number
  /** 是否仍活跃 */
  active: boolean
  /** 创建年份 */
  createdYear: number
  /** 最近扩散年份 */
  lastSpreadYear: number,
}

// ============================================================
// §10 特殊材料
// ============================================================

/** 材料稀有度 */
export type MaterialRarity = 'common' | 'uncommon' | 'rare' | 'fine' | 'epic' | 'legendary'

/** 材料类别 */
export type MaterialCategory = 'cultivation' | 'magic' | 'scifi' | 'wasteland'

/** 特殊材料定义 */
export interface SpecialMaterial {
  id: string
  name: string
  category: MaterialCategory
  rarity: MaterialRarity
  baseQuantity: number
  currentQuantity: number
  discovered: boolean
  /** 已使用次数（废案兼容） */
  usesCount: number
  /** 最近发现年份 */
  lastDiscoveryYear: number,
}

/** 特殊材料子系统状态 */
export interface MaterialState {
  initialized: boolean
  materials: SpecialMaterial[]
  activeCategory: MaterialCategory,
}

// ============================================================
// §11 Store 聚合类型
// ============================================================

/** Store 聚合摘要 */
export interface PowerSystemSummary {
  combatPower: CombatPowerState
  monster: MonsterState
  luck: LuckState
  cultivation: CultivationState
  fortuneEncounter: FortuneEncounterState
  faith: FaithState
  supremeItem: SupremeItemState
  divineIntervention: DivineInterventionState
  anomalyZones: AnomalyZone[]
  anomalyGlobalInstability: number
  materials: SpecialMaterial[]
  materialActiveCategory: MaterialCategory,
}

// ============================================================
// §6 修炼体系（与战力合作模式）
// ============================================================

/** 修炼子系统状态（只从 CombatPowerState 派生，不独立存进度） */
export interface CultivationState {
  enabled: boolean
  worldview?: string
  talentTags: string[]
  realmIndex: number
  realmLabel: string
  realmId: string
  bottleneckPenalty: number
  breakthroughChance: number
  anticipation: number
  bottleneckHint: string
  trainingBonus: number
  /** 上次突破年份（用于 MIN_YEARS_BETWEEN_REALMS 间隔检查） */
  lastBreakthroughYear: number,
}

// ============================================================
// §11 技能系统（创意 #13：AI 动态生成角色技能）
// ============================================================

/** 动态生成的技能 */
export interface DynamicSkill {
  /** 技能唯一标识 */
  id: string
  /** 技能名称 */
  name: string
  /** 技能描述 */
  description: string
  /** 技能效果 */
  effects: SkillEffect[]
  /** 创建来源（触发该技能创建的事件描述） */
  originEvent: string
  /** 创建的回合年 */
  createdYear: number,
}

/** 技能效果 */
export interface SkillEffect {
  /** 影响的属性 ID */
  attr: string
  /** 效果值（正数为增益，负数为减益） */
  value: number,
}

/** 技能子系统状态 */
export interface SkillState {
  /** 角色已获得的技能列表 */
  skills: DynamicSkill[]
  /** 最大技能数 */
  maxSkills: number
  /** 最近获得的技能 ID（用于 UI 展示） */
  lastAcquiredSkillId: string | null,
}

