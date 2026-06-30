/**
 * @module types.ts
 * @description mod-tech-level 类型定义 —— 产业、资源分布、文化技术
 * @mod mod-tech-level
 */

// ============================================================
// §1 产业
// ============================================================

/** 主导产业类型 */
export type PrimaryFocus =
  | 'agriculture'      // 农业
  | 'mining'           // 矿业
  | 'manufacturing'    // 制造业
  | 'service'           // 服务业
  | 'magic'             // 魔法（超自然世界）
  | 'military'          // 军事（战争期间）
  | 'trade'             // 贸易
  | 'mixed'             // 多元化

/** 产业子系统状态 */
export interface IndustryState {
  /** 是否已初始化 */
  initialized: boolean
  /** 主导产业 */
  primaryFocus: PrimaryFocus
  /** 生产率乘数（1=基准，范围 0.1~100） */
  productivityMultiplier: number
  /** 科技采纳率（0~1） */
  techAdoptionRate: number,
}

// ============================================================
// §2 资源分布
// ============================================================

/** 区域资源条目 */
export interface RegionResource {
  /** 资源类型标识 */
  type: string
  /** 资源丰度 0-100 */
  abundance: number
  /** 资源品质 0-100 */
  quality: number,
}

/** 资源分布子系统状态（合并进 IndustrySystem 内部管理） */
export interface ResourceDistributionState {
  /** 是否已初始化 */
  initialized: boolean
  /** 区域资源映射 { 区域ID: 资源列表 } */
  regionalResources: Record<string, RegionResource[]>
  /** 全球稀缺度 0-100 */
  globalScarcity: number,
}

// ============================================================
// §3 文化技术
// ============================================================

/** 思潮类别 */
export type CultureTrendCategory =
  | 'art'              // 艺术
  | 'philosophy'       // 哲学
  | 'science'          // 科学
  | 'military'         // 军事
  | 'commerce'         // 商业
  | 'religion'         // 宗教

/** 文化思潮条目 */
export interface CultureTrend {
  /** 思潮类别 */
  type: CultureTrendCategory
  /** 思潮名称 */
  name: string
  /** 思潮强度 0-100 */
  intensity: number
  /** 剩余持续年数 */
  remainingYears: number
  /** 发源区域 */
  originRegion: string,
}

/** 文化技术子系统状态 */
export interface CultureTechState {
  /** 技术等级 1-10 */
  techLevel: number
  /** 技术进度 0-1（满 1 升级） */
  techProgress: number
  /** 当前活跃思潮列表 */
  activeTrends: CultureTrend[]
  /** 知识加成系数 */
  knowledgeBonus: number
  /** 工作质量加成系数 */
  workQualityBonus: number
  /** 上次更新纪元年份 */
  lastUpdateEraYear: number
  /** 最近事件列表 */
  activeEvents: string[],
}

// ============================================================
// §4 Store 聚合类型
// ============================================================

/** Store 聚合摘要 */
export interface TechLevelSummary {
  industry: IndustryState
  resourceDistribution: ResourceDistributionState
  cultureTech: CultureTechState,
}

// ============================================================
// §5 常量辅助类型（从 constants.ts 迁移）
// ============================================================

/** 基础地形类型 */
export type TerrainType = 'plain' | 'mountain' | 'desert' | 'forest' | 'tundra' | 'ocean' | 'swamp' | 'volcanic' | 'underground' | 'skyIsland'

/** 资源范围条目 */
export type ResourceRangeEntry = { type: string; abundance: [number, number] }

