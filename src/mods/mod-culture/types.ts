/**
 * @module types.ts
 * @description mod-culture 类型定义 —— 10 个子系统状态类型 + Store 聚合
 * @mod mod-culture
 */

// ============================================================
// §1 声望系统
// ============================================================

/** 声望维度 */
export type ReputationDimension =
  | 'military'      // 武勋
  | 'political'     // 政绩
  | 'academic'      // 学术
  | 'economic'      // 财富
  | 'moral'         // 道德
  | 'religious'     // 信仰

/** 声望条目 */
export interface ReputationEntry {
  dimension: ReputationDimension
  value: number
  source: string
  lastChanged: string
}

/** 声望状态 */
export interface ReputationState {
  /** 维度声望 */
  dimensions: Record<ReputationDimension, ReputationEntry>
  /** 全局声望 0-100 */
  globalReputation: number
  /** 知名度 0-100 */
  fame: number
}

// ============================================================
// §2 家族系统
// ============================================================

// ============================================================
// §3 家族系统
// ============================================================

/** 家族成员角色 */
export type FamilyRole = 'spouse' | 'child' | 'parent' | 'sibling' | 'cousin' | 'ancestor'

/** 配偶关系状态 */
export type SpouseStatus = 'happy' | 'strained' | 'estranged' | 'widowed'

/** 家族成员 */
export interface FamilyMember {
  id: string
  name: string
  role: FamilyRole
  age: number
  alive: boolean
  /** 能力值 0-100 */
  ability: number
  /** 与玩家关系 -100 ~ 100 */
  affinity: number
  /** 备注 */
  notes: string
  /** 配偶关系质量 0-100（role=spouse 时启用） */
  relationshipQuality?: number
  /** 配偶关系状态（role=spouse 时启用） */
  spouseStatus?: SpouseStatus
  /** 子女是否已独立/离家（role=child 且成年后） */
  independent?: boolean
  /** 是否已婚（role=child 成年后用于婚嫁状态） */
  married?: boolean
  /** 配偶名称（role=child 已婚时） */
  spouseName?: string
}

/** 家族状态 */
export interface FamilyState {
  /** 家族名称 */
  familyName: string
  /** 家族声望 0-100 */
  familyReputation: number
  /** 家族财富 */
  familyWealth: number
  /** 成员列表 */
  members: FamilyMember[]
  /** 家族历史事件 */
  history: string[]
}

// ============================================================
// §4 教育系统
// ============================================================

/** 教育制度类型 */
export type EducationSystemType = 'private' | 'public' | 'religious' | 'guild' | 'academy'

/** 教育质量等级 */
export type EducationQuality = 'poor' | 'adequate' | 'good' | 'excellent'

/** 教育水平等级 */
export type EducationLevel = 'none' | 'elite' | 'basic' | 'universal' | 'advanced'

/** 教育方向 */
export type EducationDirection = 'general' | 'vocational' | 'classical' | 'scientific' | 'mystical'

/** 教育状态 */
export interface EducationState {
  /** 教育制度类型 */
  systemType: EducationSystemType
  /** 教育机构列表 */
  institutions: string[]
  /** 知识积累总量 */
  knowledgeTotal: number
  /** 识字率 0-100 */
  literacyRate: number
  /** 教育普及度 0-100 */
  educationAccess: number
  /** 科研产出 */
  researchOutput: number
  /** 知识传播速率 0-0.5 */
  knowledgeSpreadRate: number
  /** 教育方向（影响知识/创新乘数类型） */
  educationDirection: EducationDirection
  /** 教育水平（基于 literacyRate 自动判定） */
  educationLevel: EducationLevel
  /** 分阶层识字率（0-100） */
  literacyByClass: Record<'elite' | 'middle' | 'common', number>
  /** 世界观标识 */
  worldview: string
}

// ============================================================
// §5 文化系统
// ============================================================

/** 文化价值维度 */
export type CulturalValue =
  | 'collectivism'    // 集体主义
  | 'individualism'   // 个人主义
  | 'hierarchy'       // 等级制
  | 'egalitarianism'  // 平等主义
  | 'militarism'      // 尚武
  | 'pacifism'        // 和平主义
  | 'spiritualism'    // 灵性
  | 'materialism'     // 物质主义

/** 节日 */
export interface Festival {
  name: string
  /** 节日日期（月份-日） */
  date: string
  description: string
  /** 重要性 1-5 */
  importance: number
  /** 适用世界观列表（空=通用） */
  worldTypes?: string[]
  /** 触发频率（年） */
  frequencyYears?: number
  /** 最近触发年份 */
  lastTriggeredYear?: number
  /** 属性影响（如 { charisma: 1, luck: 1 }） */
  effects?: Record<string, number>
}

/** 仪式 */
export interface Ritual {
  name: string
  category: 'birth' | 'coming_of_age' | 'marriage' | 'death' | 'harvest' | 'war' | 'worship'
  description: string
  /** 适用世界观列表 */
  worldTypes?: string[]
  /** 触发条件文本 */
  triggerCondition?: string
  /** 对传统强度的影响 */
  traditionImpact?: number
}

/** 禁忌 */
export interface Taboo {
  action: string
  severity: 'mild' | 'moderate' | 'severe' | 'capital'
  consequence: string
  /** 适用世界观列表 */
  worldTypes?: string[]
  /** 违反后对传统强度的影响（负值） */
  traditionImpactOnViolation?: number
}

/** 习俗类别 */
export type CustomCategory = 'greeting' | 'coming_of_age' | 'marriage' | 'funeral'

/** 习俗（运行时） */
export interface Custom {
  name: string
  category: CustomCategory
  description: string
  worldTypes?: string[]
  frequencyYears?: number
  lastTriggeredYear?: number
  effects?: Record<string, number>
  traditionImpact?: number
}

/** 值得关注的事件（由习俗周期性产出） */
export interface NotableEvent {
  year: number
  type: 'custom'
  customCategory: CustomCategory
  name: string
  description: string
  impact: Record<string, number>
}

/** 文化状态 */
export interface CultureState {
  /** 文化名 */
  cultureName: string
  /** 传统强度 0-100 */
  traditionStrength: number
  /** 改革阻力 0-100 */
  reformResistance: number
  /** 文化惯性 0-100 */
  culturalInertia: number
  /** 改革压力 0-100 */
  reformPressure: number
  /** 文化价值取向 */
  values: Record<CulturalValue, number>
  /** 节日列表 */
  festivals: Festival[]
  /** 仪式列表 */
  rituals: Ritual[]
  /** 禁忌列表 */
  taboos: Taboo[]
  /** 习俗列表 */
  customs: Custom[]
  /** 本轮产生的 NotableEvent */
  notableEvents: NotableEvent[]
  /** 艺术繁荣度 0-100 */
  artProsperity: number
}

// ============================================================
// §6 艺术系统
// ============================================================

/** 艺术形式 */
export type ArtForm = 'literature' | 'painting' | 'music' | 'sculpture' | 'architecture' | 'theater' | 'dance'

/** 艺术作品 */
export interface Artwork {
  id: string
  name: string
  form: ArtForm
  creator: string
  /** 品质 0-100 */
  quality: number
  /** 影响力 0-100 */
  influence: number
  /** 创作年份 */
  yearCreated: number
}

/** 艺术状态 */
export interface ArtState {
  /** 当前艺术流派 */
  currentStyles: string[]
  /** 著名作品 */
  notableWorks: Artwork[]
  /** 艺术赞助水平 0-100 */
  patronageLevel: number
  /** 艺术声望 0-100 */
  prestige: number
  /** 创新指数 0-100 */
  innovationIndex: number
  /** 世界观标识（用于风格池选择） */
  worldview: string
}

// ============================================================
// §7 弟子系统
// ============================================================

/** 弟子生命周期阶段 */
export type DiscipleStatus = 'apprentice' | 'mature' | 'famous' | 'deceased' | 'departed'

/** 弟子 */
export interface Disciple {
  id: string
  name: string
  /** 忠诚度 0-100 */
  loyalty: number
  /** 天赋 0-100 */
  talent: number
  /** 当前修炼/学习方向 */
  focus: string
  /** 能力评分 */
  abilityScore: number
  /** 加入年份 */
  joinedYear: number
  /** 年龄 */
  age: number
  /** 生命周期阶段 */
  status: DiscipleStatus
  /** 成名成就描述（status=famous 时可选） */
  achievement?: string
}

/** 弟子状态 */
export interface DiscipleState {
  disciples: Disciple[]
  /** 最大弟子容量 */
  maxCapacity: number
}

// ============================================================
// §8 个人能力系统
// ============================================================

/** 技能条目 */
export interface SkillEntry {
  name: string
  /** 等级 1-100 */
  level: number
  /** 经验值 0-100 */
  xp: number
  /** 上次使用年份 */
  lastUsedYear: number
  /** 衰退速率 */
  decayRate: number
}

/** 知识类别 */
export type KnowledgeCategory = 'location' | 'person' | 'item' | 'event' | 'secret' | 'skill'

/** 知识条目 */
export interface KnowledgeEntry {
  topic: string
  /** 掌握度 0-100 */
  mastery: number
  /** 上次复习年份 */
  lastReviewedYear: number
  /** 遗忘概率/年 */
  forgetRate: number
  /** 知识类别（6 种） */
  category: KnowledgeCategory
  /** 准确度 0-100 */
  accuracy: number
  /** 是否已遗忘 */
  isForgotten: boolean
}

/** 个人能力状态 */
export interface PersonalAbilityState {
  skills: Record<string, SkillEntry>
  knowledge: Record<string, KnowledgeEntry>
  /** 技能点数上限 */
  skillCap: number
  /** 角色基础属性（体质/智力/悟性等，0-100） */
  attributes: Record<string, number>
}

// ============================================================
// §9 成就系统
// ============================================================

/** 成就稀有度 */
export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary'

/** 成就 */
export interface Achievement {
  id: string
  name: string
  description: string
  /** 是否已解锁 */
  unlocked: boolean
  /** 解锁年份 */
  unlockedYear: number
  /** 成就点 */
  points: number
  /** 成就分类 */
  category: 'exploration' | 'social' | 'economic' | 'military' | 'culture' | 'personal' | 'relationship' | 'skill' | 'combat' | 'survival'
  /** 稀有度 */
  rarity: AchievementRarity
  /** 图标 emoji */
  icon: string
}

/** 成就状态 */
export interface AchievementState {
  achievements: Achievement[]
  totalPoints: number
}

// ============================================================
// §10 著作系统
// ============================================================

/** 创作状态 */
export type WorkStatus = 'in_progress' | 'completed' | 'lost'

/** 作品分类 */
export type WorkCategory = 'biography' | 'novel' | 'treatise' | 'poetry' | 'art' | 'craft' | 'code' | 'paper' | 'holo'

/** 著作条目 */
export interface WorksEntry {
  id: string
  title: string
  category: WorkCategory
  status: WorkStatus
  /** 创作进度 0-100 */
  progress: number
  /** 开始创作年份 */
  startEraYear: number
  /** 完成年份（status=completed 时） */
  completedEraYear?: number
  /** 名声值 0-100 */
  fame: number
}

/** 著作状态 */
export interface WorksState {
  works: WorksEntry[]
  nextId: number
}

// ============================================================
// §11 Store 聚合类型
// ============================================================

/** MOD 整体摘要 */
export interface CultureSummary {
  reputation: ReputationState
  family: FamilyState
  education: EducationState
  culture: CultureState
  art: ArtState
  disciple: DiscipleState
  personalAbility: PersonalAbilityState
  achievement: AchievementState
  works: WorksState
}
