/**
 * @module types.ts
 * @description mod-politics 类型定义 —— 7 个子系统状态类型 + Store 聚合类型
 * @mod mod-politics
 */

// ============================================================
// §1 社会分层系统 (合并 NobleHouse)
// ============================================================

/** 社会阶层 */
export type SocialStratum =
  | 'royalty'        // 皇室
  | 'nobility'       // 贵族
  | 'gentry'         // 士绅
  | 'commoner'       // 平民
  | 'peasant'        // 农民
  | 'slave'          // 奴隶

/** 世族/世家 */
export interface NobleHouse {
  id: string
  name: string
  stratum: SocialStratum
  /** 势力范围 */
  influence: number
  /** 财富 */
  wealth: number
  /** 领地 */
  territories: string[]
  /** 敌对世家 */
  rivalHouses: string[]
  /** 同盟世家 */
  allyHouses: string[],
}

/** 个人阶层流动状态机 */
export interface SocialClassState {
  /** 当前阶层 */
  currentTier: SocialStratum
  /** 目标阶层（财富达标后的跃迁目标） */
  targetTier: SocialStratum
  /** 在目标阶层停留的年份数（>=5 才确认流动） */
  roundsAtTarget: number
  /** 是否正在向上流动 */
  isUpwardMobile: boolean,
}

/** 社会分层状态 */
export interface SocialStratificationState {
  /** 玩家当前阶层 */
  playerStratum: SocialStratum
  /** 阶层流动性 0-100 */
  socialMobility: number
  /** 阶层人口比例 */
  stratumPopulation: Record<SocialStratum, number>
  /** 世族列表 */
  nobleHouses: NobleHouse[]
  /** 阶层术语（AI 适配） */
  stratumLabels: Record<SocialStratum, string>
  /** 个人阶层流动状态机 */
  playerClassState: SocialClassState
  /** 玩家财富快照（用于阶层流动检测） */
  playerWealthSnapshot: number,
}

// ============================================================
// §2 派系动态系统
// ============================================================

/** 派系涨跌状态 */
export type FactionStatus = 'rising' | 'stable' | 'declining'

/** 派系等级 */
export interface FactionRank {
  name: string
  contributionRequired: number,
}

/** 派系 */
export interface Faction {
  id: string
  name: string
  /** 派系类型 */
  type: 'political' | 'military' | 'religious' | 'commercial' | 'academic' | 'secret'
  /** 成员数 */
  memberCount: number
  /** 影响力 0-100 */
  influence: number
  /** 目标 */
  goal: string
  /** 对玩家态度 -100 ~ 100 */
  attitudeToPlayer: number
  /** 敌对派系 ID 列表 */
  rivals: string[]
  /** 同盟派系 ID 列表 */
  allies: string[]
  /** 涨跌状态 */
  status: FactionStatus
  /** 上一轮影响力（用于计算涨跌） */
  lastInfluence: number,
}

/** 派系状态 */
export interface FactionState {
  factions: Faction[]
  /** 玩家所属派系 ID（null=未加入） */
  playerFactionId: string | null
  /** 玩家在该派系中的贡献值 */
  playerContribution: number
  /** 玩家在该派系中的等级索引 */
  playerRank: number,
}

// ============================================================
// §3 国家关系系统
// ============================================================

/** 外交立场 */
export type DiplomaticStance = 'ally' | 'neutral' | 'hostile' | 'war' | 'vassal' | 'overlord'

/** 国家关系条目 */
export interface NationRelationEntry {
  nationId: string
  nationName: string
  stance: DiplomaticStance
  /** 关系值 -100 ~ 100 */
  relation: number
  /** 贸易量 */
  tradeVolume: number
  /** 是否有联姻 */
  hasMarriageAlliance: boolean
  /** 紧张度计数器（积累至阈值→战争） */
  tension: number
  /** 和平度计数器（积累至阈值→同盟） */
  peace: number
  /** 侵略性 0-100 */
  aggressiveness: number
  /** 国力 0-100 */
  power: number
  /** 繁荣度 0-100 */
  prosperity: number
  /** 最近外交事件（用于叙事提示） */
  recentEvents: string[],
}

/** 国家关系状态 */
export interface NationRelationState {
  relations: NationRelationEntry[],
}

// ============================================================
// §4 法律系统
// ============================================================

/** 法律类别 */
export type LawCategory = 'criminal' | 'civil' | 'commercial' | 'religious' | 'military'

/** 法律条目 */
export interface LawEntry {
  id: string
  name: string
  category: LawCategory
  /** 严厉程度 0-100 */
  severity: number
  /** 是否启用 */
  active: boolean
  /** 违规惩罚 */
  punishment: string,
}

/** 法律体系类型 */
export type LegalSystemType = 'customary' | 'statutory' | 'religious' | 'martial' | 'anarchic'

/** 法律状态 */
export interface LegalState {
  /** 法律体系类型 */
  systemType: LegalSystemType
  laws: LawEntry[]
  /** 执法力度 0-100 */
  enforcementLevel: number
  /** 腐败程度 0-100 */
  corruption: number,
}

// ============================================================
// §5 冲突周期系统 (可选)
// ============================================================

/** 六阶段冲突周期 */
export type ConflictPhase =
  | 'peace'           // 和平
  | 'tension'         // 紧张
  | 'escalation'      // 升级
  | 'crisis'          // 危机
  | 'climax'          // 爆发
  | 'resolution'      // 解决

/** 对手状态 */
export type AntagonistStatus = 'active' | 'defeated' | 'submitted' | 'destroyed'

/** 对手档案 */
export interface AntagonistProfile {
  id: string
  name: string
  type: string
  power: number
  pride: number
  persistence: number
  status: AntagonistStatus
  actionKeywords: string[]
  comboCount: number,
}

/** 冲突事件 */
export interface ConflictEvent {
  phase: ConflictPhase
  description: string
  /** 涉事方 */
  parties: string[]
  /** 严重程度 0-100 */
  severity: number
  /** 发生年份 */
  year: number,
}

/** 冲突周期状态 */
export interface ConflictCycleState {
  /** 是否启用 */
  enabled: boolean
  /** 当前阶段 */
  currentPhase: ConflictPhase
  /** 阶段进度 0-100 */
  phaseProgress: number
  /** 冲突事件历史 */
  history: ConflictEvent[]
  /** 当前冲突主题 */
  currentTheme: string
  /** 戏剧张力 0-100 */
  tension: number
  /** 打脸连击数 */
  comboCount: number
  /** 累积耻辱值 */
  pendingHumiliation: number
  /** 当前活跃对手 */
  antagonist: AntagonistProfile | null
  /** 对手池（含已挫败的） */
  antagonistPool: AntagonistProfile[],
}

// ============================================================
// §6 语言命名系统
// ============================================================

/** 语言档案（多语言生态中的单一语言） */
export interface LanguageProfile {
  /** 语言名称 */
  name: string
  /** 声望 0-100 */
  prestige: number
  /** 使用人数 */
  speakers: number
  /** 方言列表 */
  dialects: string[]
  /** 是否已消亡 */
  isDead: boolean
  /** 音素池（用于生成名称） */
  phonemePool: string[]
  /** 是否为主导语言 */
  isDominant: boolean,
}

/** 语言状态 */
export interface LanguageNamingState {
  /** 当前主导语言 */
  dominantLanguage: string
  /** 语言档案列表（多语言生态） */
  profiles: LanguageProfile[]
  /** 语言变体列表 */
  languageVariants: string[]
  /** 命名前缀池 */
  namePrefixes: string[]
  /** 命名中缀池 */
  nameInfixes: string[]
  /** 命名后缀池 */
  nameSuffixes: string[]
  /** 特殊命名规则 */
  specialRules: Record<string, string>,
}

// ============================================================
// §7 社会价值系统
// ============================================================

/** 社会价值 */
export interface SocialValue {
  name: string
  /** 重要度 0-100 */
  importance: number
  /** 拥护者比例 0-1 */
  adherentRatio: number
  /** 描述 */
  description: string
  /** 跨系统权重修正（key=系统名，value=修正值，如 law: 10 表示法律系统+10） */
  weightModifiers: Record<string, number>,
}

/** 社会价值状态 */
export interface SocialValuesState {
  values: SocialValue[]
  /** 代际价值观变迁速率 */
  generationalShiftRate: number
  /** 当前主导价值观名称 */
  dominantValue: string
  /** 主导权变迁进度 0-100 */
  valueShiftProgress: number,
}

// ============================================================
// §8 Store 聚合类型
// ============================================================

/** MOD 整体摘要 */
export interface PoliticsSummary {
  socialStratification: SocialStratificationState
  faction: FactionState
  nationRelation: NationRelationState
  legal: LegalState
  conflictCycle: ConflictCycleState
  languageNaming: LanguageNamingState
  socialValues: SocialValuesState,
}
