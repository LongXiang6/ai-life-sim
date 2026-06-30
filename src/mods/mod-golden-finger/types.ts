/**
 * @module types
 * @description MOD 类型定义 —— 金手指系统：15种模板 + 3模式 + 系统面板扩展
 * @mod mod-golden-finger
 */

// ========== 类型分类 ==========

/** 系统面板类型（10种） */
export type PanelType =
  | 'attribute_panel'
  | 'quest_system'
  | 'gacha_wheel'
  | 'check_in'
  | 'shop_panel'
  | 'appraisal_skill'
  | 'achievement_system'
  | 'skill_deduction'
  | 'sim_management'
  | 'time_retrospect'

/** 非面板类型（5种） */
export type NonPanelType =
  | 'cultivation_legacy'
  | 'innate_ability'
  | 'knowledge_awakening'
  | 'bloodline_awakening'
  | 'fate_contract'

export type GoldenFingerKind = PanelType | NonPanelType

/** 品质等级 */
export type GoldenFingerTier = 'legendary' | 'rare' | 'uncommon' | 'unique'

/** 运行模式 */
export type GoldenFingerMode = 'off' | 'random' | 'manual'

/** 系统面板叙事人格 */
export type NarrativePersona = 'cold_machine' | 'chatty_comic'

// ========== 模板 ==========

/** 金手指模板定义 */
export interface GoldenFingerTemplate {
  id: string
  kind: GoldenFingerKind
  name: string
  description: string
  tier: GoldenFingerTier
  features: string[]
  rules: string[]
  persona: NarrativePersona
  /** 对各属性的被动加成倍率 */
  boosts: Record<string, number>
  /** 操作的目标子系统 ID 列表 */
  targetSubsystems: string[]
  activationCondition?: string
}

// ========== 状态 ==========

/** 任务条目（任务面板专用） */
export interface QuestEntry {
  id: string
  name: string
  description: string
  targetSubsystem: string
  targetAction: string
  reward: Record<string, number>
  turnsRemaining: number
  completed: boolean,
}

/** 金手指子系统状态 */
export interface GoldenFingerState {
  mode: GoldenFingerMode
  assigned: boolean
  template: GoldenFingerTemplate | null
  level: number
  levelProgress: number
  unlockedFeatures: string[]
  panelPoints?: number
  quests?: QuestEntry[]
  checkInStreak?: number
  shopCurrency?: number
  gachaCurrency?: number,
}

/** 被动加成结果 */
export interface GoldenFingerBoosts {
  characterBase?: Record<string, number>
  combatPower?: Record<string, number>
  luck?: Record<string, number>
  economy?: Record<string, number>
  education?: Record<string, number>
  industry?: Record<string, number>
  health?: Record<string, number>
  lifespan?: Record<string, number>
  reputation?: Record<string, number>
  [subsystem: string]: Record<string, number> | undefined
}

/** 面板操作结果 */
export interface PanelActionResult {
  success: boolean
  description: string
  targetSubsystem: string
  changes: Record<string, unknown>,
}

