/**
 * @module types.ts
 * @description MOD 类型定义 —— 世界配置、具名实体、时间线、区域
 * @mod mod-world
 */

import type { WorldAIDetailedParameters } from './prompts/world-config-prompt'
import type {
  ContextCapabilityProfile,
  SimulationScopeRecord,
  SpatialEdge,
  SpatialGraphContract,
  WorldContextRecord,
} from '@/foundation'

/** AI 世界初始化状态 */
export interface WorldInitAIStatus {
  status: 'idle' | 'running' | 'complete' | 'failed'
  currentStep?: string
  stepTimers?: Record<string, { start: number; end?: number }>
  calibrationGenerated: boolean
  tagsGenerated: boolean
  configGenerated: boolean
  entitiesGenerated: boolean
  retryCount: number
  maxRetries: number
  errors: string[]
}

// ==================== 世界校准（AI Step 0） ====================

/** 时间线事件分布策略 */
export type EventDistributionStrategy =
  | 'balanced'
  | 'prehistoric'
  | 'political'
  | 'cosmic_epic'
  | 'apocalyptic'
  | 'mystical'

/** 地图模板 ID */
export type MapTemplateId =
  | 'continent'
  | 'archipelago'
  | 'pangaea'
  | 'multiContinent'
  | 'oceanWorld'
  | 'plane'
  | 'starSystems'
  | 'flatDiscWorld'
  | 'void'

/** 实体数量范围 */
export interface EntityCountRange {
  min: number
  max: number
}

/** 世界校准 —— AI Step 0 输出，驱动模拟公式系数与初始化数量级 */
export interface WorldCalibration {
  metadata: {
    essenceTag: string
    civilizationStage: string
    powerSystemTag: string
    spatialForm: string
    difficulty?: WorldConfig['difficulty']
  }
  styleGuide?: {
    worldviewStyleHint?: string
    narrativeTone?: string
    eventTypeWeights?: Record<string, number>
  }
  timeline?: {
    eraStartYear?: number
    stageSpan?: number
    impactDistribution?: EventDistributionStrategy
  }
  entities?: {
    nationCount?: EntityCountRange
    factionCount?: EntityCountRange
    nobleHouseCount?: EntityCountRange
    settlementCount?: EntityCountRange
    tradeRouteCount?: EntityCountRange
  }
  world?: {
    populationBase?: number
    developmentRange?: { min: number; max: number }
    mapTemplate?: MapTemplateId
    regionCount?: number
  }
  formulas?: WorldCalibrationFormulas
}

/** L2 公式系数 + L3 策略 */
export interface WorldCalibrationFormulas {
  populationModifier?: number
  developmentModifier?: number
  impactRangeModifier?: number
  birthRateModifier?: number
  fertilityModifier?: number
  deathRateModifier?: number
  inflationModifier?: number
  tradeMultiplierModifier?: number
  hpRecoveryModifier?: number
  staminaRecoveryModifier?: number
  lifespanModifier?: number
  attributeDecayModifier?: number
  breakthroughChanceModifier?: number
  cultivationSpeedModifier?: number
  bottleneckModifier?: number
  monsterThreatModifier?: number
  monsterSpawnModifier?: number
  luckPointModifier?: number
  socialMobilityModifier?: number
  factionEmergenceModifier?: number
  warFrequencyModifier?: number
  warDamageModifier?: number
  legalEnforcementModifier?: number
  ecologyRecoveryModifier?: number
  pollutionDecayModifier?: number
  resourceConsumptionModifier?: number
  disasterFrequencyModifier?: number
  techProgressModifier?: number
  techBreakthroughModifier?: number
  industryProductivityModifier?: number
  economyModifier?: number
  economyTierRatios?: [number, number, number, number, number]
  crossDomainEffectModifier?: number
  eventDistributionStrategy?: EventDistributionStrategy
  migrationRateModifier?: number
  literacyGrowthModifier?: number
  incomeModifier?: number
  conflictEscalationModifier?: number
  devotionGainModifier?: number
  causalCaptureRate?: number
}

/** 可数值叠加的公式 modifier 键（排除 enum / tuple 字段） */
export type FormulaModifierKey = Exclude<
  keyof WorldCalibrationFormulas,
  'eventDistributionStrategy' | 'economyTierRatios'
>

/** 世界配置（用户创建世界时提交的 5 个维度参数） */
export interface WorldConfig {
  /** 世界名称 */
  name: string
  /** 纪元名称（如"公元"、"星际历"、"创世纪元"）。缺省时由引擎根据 eraStartYear 自动判定 */
  eraName?: string
  /** 纪元起始年份（0 表示无自定义纪年，由引擎自动生成年号） */
  eraStartYear?: number
  /** 世界观本质标签（如 cultivation/scifi/medieval） */
  essenceTag: string
  /** 力量体系标签（如 cultivation/technology/magic） */
  powerSystemTag: string
  /** 力量等级上限（1-24，由空间形态自动限制） */
  powerCeiling: number
  /** 空间形态标签（如 plane/universe/crystalSphere/multiverse/omniverse） */
  spatialForm: string
  /** 文明阶段标签（如 primitive/medieval/industrial/space） */
  civilizationStage: string
  /** 游戏难度（normal/hard/nightmare/hell，默认 normal） */
  difficulty: 'normal' | 'hard' | 'nightmare' | 'hell'
  /** 世界描述文本 */
  description: string
  /** 世界类型（materialist/idealist/mixed，默认 idealist） */
  worldType?: string
  /** AI 标记位（记录哪些字段由 AI 自动决定） */
  _aiFlags?: Record<string, boolean>
  /** 用户显式锁定字段，阻止 coherence 自动覆盖 */
  _coherenceLocks?: Partial<Record<'essenceTag' | 'civilizationStage' | 'powerSystemTag' | 'spatialForm', boolean>>
  /** 各维度的编辑模式（ai=AI决定 / adaptive=选择 / custom=自定义），用于 AI prompt 上下文 */
  _dimensionModes?: Record<string, 'ai' | 'adaptive' | 'custom'>
  /** 各维度的用户选择值（仅 adaptive/custom 模式有效），用于 AI prompt 上下文 */
  _dimensionValues?: Record<string, string>
  /** AI 生成的 W02 详细参数（world-config-prompt 产出） */
  aiDetailedParameters?: WorldAIDetailedParameters
}

// ==================== 具名实体 ====================

/** 世界实体基类 */
export interface WorldEntity {
  /** 存档内全局唯一业务 ID；P0 后 id 即为该值 */
  id: string
  /** 迁移前或上下文内的本地 ID，仅用于兼容和审计 */
  localId?: string
  /** 实体所属上下文 */
  contextId?: string
  name: string
  type: 'nation' | 'faction' | 'nobleHouse' | 'settlement' | 'tradeRoute'
  regionId?: string
  /** 实体描述文本（≤30字） */
  description: string
  attributes: Record<string, unknown>,
}

/** 国家 */
export interface Nation extends WorldEntity {
  type: 'nation'
  capital: string
  /** 国家稳定度 0-100 */
  stability: number
  population: number,
}

/** 势力 */
export interface Faction extends WorldEntity {
  type: 'faction'
  factionType: 'military' | 'religious' | 'merchant' | 'academic' | 'political'
  /** 势力强度 0-100 */
  power: number
  /** 势力覆盖的区域 ID 列表 */
  influenceRegionIds: string[]
  /** 加入条件描述（来源废案 joinRequirement，如"完成五项骑士试炼并宣誓忠诚"） */
  joinRequirement?: string,
}

/** 贵族世家 */
export interface NobleHouse extends WorldEntity {
  type: 'nobleHouse'
  homeRegion: string
  rank: 'duke' | 'marquis' | 'earl' | 'count' | 'baron'
  influence: number,
}

/** 定居点 */
export interface Settlement extends WorldEntity {
  type: 'settlement'
  tier: 'village' | 'town' | 'city' | 'metropolis'
  population: number
  developmentLevel: number,
}

/** 商路 */
export interface TradeRoute extends WorldEntity {
  type: 'tradeRoute'
  fromSettlementId: string
  toSettlementId: string
  prosperity: number,
}

/** 所有具名实体的联合类型 */
export type AnyWorldEntity = Nation | Faction | NobleHouse | Settlement | TradeRoute

// ==================== 区域 ====================

/** 区域数据 */
export interface RegionData {
  /** 存档内全局唯一空间节点 ID；P0 后 id 即为该值 */
  id: string
  /** 迁移前或上下文内的本地 ID */
  localId?: string
  /** 所属上下文 */
  contextId?: string
  name: string
  /** 所属地图模板类型 */
  templateType: string
  /** 温度 -10~40（基于 Y 坐标 + 随机扰动） */
  temperature: number
  /** 湿度 0-100（距中线距离 + 随机扰动） */
  humidity: number
  /** 地形标签（由 GeographySystem 定义具体特征） */
  terrainTag: string
  /** 资源分布 */
  resourceDistribution: Record<string, number>
  /** 人口 */
  population: number
  /** 开发度 0-100 */
  developmentLevel: number,
}

// ==================== 世界快照 ====================

/** 世界初始化快照（引擎编排器注入 RoundContext 用） */
export interface WorldSnapshot {
  /** 本快照所属上下文 */
  contextId: string
  /** 本上下文空间根节点 */
  rootSpatialNodeId: string
  worldConfig: WorldConfig
  entities: AnyWorldEntity[]
  regions: RegionData[]
  /** 世界标签（6×39 层次标签体系，来源废案 WorldTagsV2） */
  tags: WorldTagsV2,
}

/** 一个可独立保存、休眠和恢复的世界上下文实例。 */
export interface WorldContextInstance {
  record: WorldContextRecord
  capabilityProfile: ContextCapabilityProfile
  scope: SimulationScopeRecord
  spatialGraph: SpatialGraphContract
  worldConfig: WorldConfig
  worldCode: number
  initialized: boolean
  entities: AnyWorldEntity[]
  regions: RegionData[]
  tags: WorldTagsV2
  worldTags: string[]
  currentYear: number
  eraStartYear: number
  eraName: string
  calibration: WorldCalibration | null
  destinyPatternModifiers: Partial<Record<FormulaModifierKey, number>>
  worldInitAIStatus: WorldInitAIStatus | null
}

export interface WorldContextCollection {
  contexts: Record<string, WorldContextInstance>
  currentContextId: string | null
  crossContextEdges: Record<string, SpatialEdge>
}

// ==================== 地图模板 ====================

/** 区域生成策略类型 */
export type GenerationStrategy = 'climateLatitude' | 'concentricRings' | 'discrete' | 'cosmic' | 'abstract'

export interface MapTemplateConfig {
  label: string
  regionCount: number
  description: string
  /** 区域生成策略：climateLatitude(星球气候带) | concentricRings(天圆地方同心环) | discrete(位面独立空间) | cosmic(星际尺度) | abstract(虚空抽象) */
  generationStrategy: GenerationStrategy,
}

// ==================== 世界标签 V2（6×39 层次标签体系） ====================
// 来源：废案 world-tags-generator.ts + world-tag-defaults.ts

/** 社会维度标签（7 字段） */
export interface SocietyTags {
  socialClass: string
  politicalStability: string
  factionDensity: string
  urbanization: string
  legalSystem: string
  educationLevel: string
  familyStructure: string,
}

/** 环境维度标签（6 字段） */
export interface EnvironmentTags {
  disasterFrequency: string
  climateType: string
  terrainType: string
  resourceAbundance: string
  biomeDiversity: string
  pollutionLevel: string,
}

/** 经济维度标签（6 字段） */
export interface EconomyTags {
  economyType: string
  wealthDistribution: string
  tradeNetwork: string
  currencySystem: string
  techLevel: string
  industryFocus: string,
}

/** 超自然维度标签（7 字段） */
export interface SupernaturalTags {
  powerSystem: string
  powerDensity: string
  powerAccessibility: string
  divineActivity: string
  monsterPresence: string
  cultivationCeiling: string
  supernaturalTaboo: string,
}

/** 人口维度标签（6 字段） */
export interface DemographicsTags {
  populationDensity: string
  raceDiversity: string
  lifespanBaseline: string
  healthLevel: string
  literacyRate: string
  socialMobility: string,
}

/** 文化维度标签（7 字段） */
export interface CulturalFabricTags {
  honorImportance: string
  artStyle: string
  religiousInfluence: string
  traditionStrength: string
  innovationRate: string
  culturalDiversity: string
  narrativeTone: string,
}

/** 约束规则（3 字段） */
export interface WorldTagConstraints {
  hardForbidden: string[]
  softForbidden: string[]
  narrativeRules: string[],
}

/** 世界标签 V2 —— 6 大类 × 39 子类别层次标签体系 */
export interface WorldTagsV2 {
  /** 世界观类型标识 */
  worldview: string
  /** 社会维度标签 */
  society: SocietyTags
  /** 环境维度标签 */
  environment: EnvironmentTags
  /** 经济维度标签 */
  economy: EconomyTags
  /** 超自然维度标签 */
  supernatural: SupernaturalTags
  /** 人口维度标签 */
  demographics: DemographicsTags
  /** 文化维度标签 */
  culturalFabric: CulturalFabricTags
  /** 约束规则 */
  constraints: WorldTagConstraints,
}
