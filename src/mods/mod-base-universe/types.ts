/**
 * @module types
 * @description mod-base-universe 类型定义 —— 天象/纪元/世界地图/命运预言 4 子系统状态
 * @mod mod-base-universe
 */

// ============================================================
// §4.1.1 天象
// ============================================================

/** 天象四阶段 */
export type CelestialPhase = 'normal' | 'auspicious' | 'omen' | 'anomaly'

/** 天象事件稀有度 */
export type CelestialEventRarity = 'common' | 'rare' | 'epic'

/** 天象事件前置条件类型 */
export type CelestialPrerequisiteType = 'worldAge' | 'worldview' | 'previousPhase' | 'minLuck'

/** 天象事件前置条件 */
export interface CelestialEventPrerequisite {
  type: CelestialPrerequisiteType
  /** worldAge → ">1000" 表示世界年份 > 1000；worldview → "cultivation" 匹配世界观；previousPhase → "anomaly" 需有过此阶段；minLuck → "20" 表示运气 ≥ 20 */
  value: string,
}

/** 天象事件条目 */
export interface CelestialEvent {
  name: string
  hint: string
  luckMod: number
  skillMod: number
  healthMod: number
  /** 稀有度（默认 common），影响掷骰权重 */
  rarity?: CelestialEventRarity
  /** 前置条件（可选），不满足则不参与掷骰候选 */
  prerequisites?: CelestialEventPrerequisite[]
}

/** 天象历史条目 */
export interface CelestialHistoryEntry {
  phase: CelestialPhase
  events: string[]
  eraYear: number,
}

/** 天象跨域效果 */
export interface CelestialCrossEffect {
  targetSystem: string
  effectType: string
  value: number
  description: string,
}

/** 天象子系统状态 */
export interface CelestialState {
  /** 当前天象阶段 */
  currentPhase: CelestialPhase
  /** 当前阶段剩余年数 */
  phaseDuration: number
  /** 冷却剩余年数（非 normal 阶段结束后） */
  cooldownYears: number
  /** 上次掷骰的纪元年份 */
  lastRollEraYear: number
  /** 当前活跃的天象事件描述文本 */
  activeEvents: string[]
  /** 天象历史时间线（最近 N 次变化） */
  history: CelestialHistoryEntry[]
  /** 当前阶段触发的跨域效果列表 */
  crossEffects: CelestialCrossEffect[],
}

// ============================================================
// §4.1.2 纪元
// ============================================================

/** 纪元条目 */
export interface EraEntry {
  name: string
  startAnchorYear: number,
}

/** 纪元阶段 */
export type EraPhase = 'opening' | 'mid' | 'late' | 'transition'

/** 纪元提示文本集合（含 transition_no_next 变体） */
export interface EraHints {
  opening: string
  mid: string
  late: string
  transition: string
  /** 无下一纪元时使用的更替文本 */
  transition_no_next: string,
}

/** 纪元历史条目 */
export interface EraHistoryEntry {
  name: string
  startAnchorYear: number
  /** 结束年份（null = 当前进行中） */
  endedYear: number | null,
}

/** 纪元子系统状态 */
export interface EraState {
  /** 当前纪元名称 */
  currentEraName: string
  /** 当前纪元起始年份 */
  currentEraStart: number
  /** 进入当前纪元已过年数 */
  yearsIntoEra: number
  /** 下一纪元名称（无则为 null） */
  nextEraName: string | null
  /** 距离下一纪元剩余年数（无则为 null） */
  yearsUntilNext: number | null
  /** 当前纪元阶段 */
  phase: EraPhase
  /** 阶段提示文本 */
  hint: string
  /** 已历纪元历史（含当前纪元，endedYear 为 null 表示进行中） */
  history: EraHistoryEntry[]
  /** 纪元切换速度倍率（1 = 正常速度，>1 加速更替） */
  speedMultiplier: number,
}

// ============================================================
// §4.1.3 世界地图
// ============================================================

/** 10 种地形类型 */
export type TerrainType =
  | 'plain' | 'mountain' | 'desert' | 'forest' | 'tundra'
  | 'ocean' | 'swamp' | 'volcanic' | 'underground' | 'skyIsland'

/** 10 种地图模板（v3 新增 3 种） */
export type MapTemplate =
  | 'continental' | 'archipelago' | 'pangea' | 'multicontinental'
  | 'oceanWorld' | 'planar' | 'stellar'
  | 'ringWorld' | 'hollowEarth' | 'nebula'

/** stellar 模板布局模式 */
export type StellarLayoutMode = 'circular' | 'linear'

/** 地图模板配置选项 */
export interface MapTemplateOptions {
  /** stellar 模板布局模式（默认 'circular'） */
  stellarLayoutMode?: StellarLayoutMode
  /** planar 模板层数（默认 3，范围 2~5） */
  planarLayers?: number
}

/** 区域资源 */
export interface RegionResource {
  type: string
  abundance: number
  quality: number,
}

/** 势力关系类型 */
export type FactionRelationType = 'alliance' | 'war' | 'neutral' | 'vassal' | 'trade'

/** 势力间外交关系条目 */
export interface FactionRelationEntry {
  /** 己方势力名 */
  sourceFaction: string
  /** 目标势力名 */
  targetFaction: string
  /** 关系类型 */
  relation: FactionRelationType
  /** 紧张度（0~100，越高越敌对；同盟/附庸/贸易越低越稳固） */
  tension: number,
}

/** 世界区域 */
export interface WorldRegion {
  id: string
  name: string
  terrain: TerrainType
  coordinates: { x: number; y: number }
  /** 位面索引（仅 planar/stellar 使用，默认 0） */
  planeIndex: number
  /** 方位标签 */
  directionLabel: string
  /** 邻居区域 ID 列表 */
  neighbors: string[]
  /** 气温（-30 ~ 40） */
  temperature: number
  /** 湿度（10 ~ 90） */
  humidity: number
  /** 污染值 */
  pollution: number
  /** 资源列表 */
  resources: RegionResource[]
  /** 所属势力（null = 无归属） */
  ownerFaction: string | null
  /** 人口 */
  population: number
  /** 开发度 */
  development: number
  /** AI 生成的叙事背景（首回合 AI 填充，供后续叙事引用） */
  narrativeBackground?: string
}

/** 世界地图子系统状态 */
export interface WorldMapState {
  /** 是否已初始化 */
  initialized: boolean
  /** 地图模板类型 */
  mapTemplate: MapTemplate
  /** 模板配置选项（AI 可覆盖） */
  templateOptions?: MapTemplateOptions
  /** 区域列表 */
  regions: WorldRegion[]
  /** 势力间外交关系网络 */
  factionRelations?: FactionRelationEntry[]
}

// ============================================================
// §4.1.4 命运预言
// ============================================================

/** 预言来源 */
export type ProphecySource = 'celestial' | 'oracle' | 'dream' | 'divine' | 'artifact'

/** 单条预言 */
export interface Prophecy {
  id: string
  title: string
  description: string
  source: ProphecySource
  /** 可变性（0-1，0=完全注定） */
  mutability: number
  /** 应验进度（0-100），逐步累进而非瞬时跳变 */
  progressFulfill: number
  /** 是否已被打破 */
  isBroken: boolean
  /** 创建季度 */
  createdQuarter: number
  /** 预定应验季度 */
  targetQuarter: number
  /** 关联事件 ID 列表 */
  relatedEventIds: string[]
  /** 触发此预言的上一预言 ID（因果链追溯，null = 自然生成/AI 直接注入） */
  triggeredBy?: string
}

/** 预言预兆阶段 */
export type ProphecyOmenStage = 'omen_25' | 'omen_50' | 'omen_75'

/** 预言预兆事件（进度阈值触发） */
export interface ProphecyOmenEvent {
  id: string
  prophecyId: string
  title: string
  stage: ProphecyOmenStage
  description: string
  quarter: number,
}

/** 命运预言子系统状态 */
export interface FateProphecyState {
  /** 预言列表 */
  prophecies: Prophecy[]
  /** 因果惩罚值（打破预言累积） */
  causalityPenalty: number
  /** 活跃预言数 */
  activeProphecyCount: number
  /** 上次推进季度 */
  lastAdvanceQuarter: number
  /** 最近应验的预言快照（本回合，供 orchestrator 消费后清空） */
  recentFulfilled: Prophecy[]
  /** 最近打破的预言快照（本回合） */
  recentBroken: Prophecy[]
  /** 最近触发的预兆事件（本回合，进度阈值 25/50/75） */
  recentOmens: ProphecyOmenEvent[],
}

// ============================================================
// §4.1.5 聚合汇总
// ============================================================

// ============================================================
// §4.1.6 神创世界（神明体系）
// ============================================================

/** 神明干预效果 */
export interface DeityEffect {
  text: string
  luckMod: number
  healthMod: number,
}

/** 神祇池（按世界观配置） */
export interface DeityPool {
  deities: string[]
  newDeities: string[]
  blessings: DeityEffect[]
  curses: DeityEffect[]
  omens: DeityEffect[]
  revelations: DeityEffect[],
}

/** 神创世界子系统状态 */
export interface DivineState {
  initialized: boolean
  enabled: boolean
  activeDeities: string[]
  divineFavor: Record<string, number>
  interventionProbability: number
  worldview?: string
}

// ============================================================
// §4.1.7 聚合汇总
// ============================================================

/** MOD 完整状态汇总 */
export interface BaseUniverseSummary {
  celestial: CelestialState
  era: EraState
  worldMap: WorldMapState
  fateProphecy: FateProphecyState
  divineCreation: DivineState,
}

// ============================================================
// §4.1.8 常量辅助类型（从 constants.ts 迁移）
// ============================================================

/** 预言模板 */
export interface ProphecyTemplate {
  id: string
  title: string
  description: string
  source: ProphecySource
  defaultMutability: number
  targetQuartersMin: number
  targetQuartersMax: number
  compatibleWorldviews: string[],
}

/** 地形权重 */
export interface TerrainWeight {
  terrain: TerrainType
  weight: number,
}

/** 世界观差异化天象概率 */
export interface CelestialProbabilityConfig {
  anomaly: number,
  auspicious: number,
  omen: number,
}

