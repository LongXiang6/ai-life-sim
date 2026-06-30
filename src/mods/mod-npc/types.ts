/**
 * @module types.ts
 * @description MOD 类型定义 —— NPC 独立记忆系统
 * @mod mod-npc
 *
 * 创意 #6：NPC 独立记忆系统
 *
 * 设计原则：
 *   - NPC 行为主要依赖本地规则推演，仅在关键事件时调用 AI（减少 Token 消耗）
 *   - 记忆链含关键词 + 重要性 + 时间衰减，模拟真实记忆退化
 *   - 性格决定行为倾向，关系网络驱动社交行为
 */

import type { BaseAttributes } from '@/mods/mod-character'

// ============================================================
// NPC 基础类型
// ============================================================

/** NPC 属性（扩展角色属性，增加 NPC 专属维度） */
export interface NPCAttributes extends BaseAttributes {
  /** 忠诚度 (-100 ~ 100)，影响背叛/合作概率 */
  loyalty: number
  /** 攻击性 (0 ~ 100)，影响主动战斗概率 */
  aggression: number
  /** 贪婪度 (0 ~ 100)，影响交易/掠夺倾向 */
  greed: number
  /** 社交性 (0 ~ 100)，影响主动社交概率 */
  sociability: number
}

/** NPC 性格特征 */
export interface NPCPersonality {
  /** 性格标签（如 "勇猛", "狡猾", "仁慈"） */
  traits: string[]
  /** 外向/内向 (-10 ~ 10) */
  extroversion: number
  /** 理性/感性 (-10 ~ 10) */
  rationality: number
  /** 善恶倾向 (-10 ~ 10) */
  morality: number
}

/** NPC 行为类型 */
export type NPCBehaviorType = 'idle' | 'trade' | 'combat' | 'social' | 'move' | 'train' | 'work'

// ============================================================
// 反派相关类型
// ============================================================

/** 反派原型标签 */
export type AntagonistTag =
  | 'arrogant_young_master'  // 纨绔子弟 — 嚣张跋扈，以势压人
  | 'scheming_elder'         // 老谋深算 — 暗中操纵，借刀杀人
  | 'corrupt_official'       // 贪官污吏 — 以权谋私，压榨百姓
  | 'rival_genius'           // 天才对手 — 旗鼓相当，正面竞争
  | 'foreign_invader'        // 外族入侵者 — 大军压境，横扫天下
  | 'ancient_monster'        // 上古妖魔 — 灭世之威，吞噬一切
  | 'corporate_tycoon'       // 商业巨鳄 — 经济垄断，吞并打压
  | 'political_opponent'     // 政敌 — 权力斗争，阴谋诡计
  | 'custom'                 // AI 自定义（开局适配产出）

/** 反派标签中文映射 */
export const ANTAGONIST_TAG_LABELS: Record<AntagonistTag, string> = {
  arrogant_young_master: '纨绔子弟',
  scheming_elder: '老谋深算',
  corrupt_official: '贪官污吏',
  rival_genius: '天才对手',
  foreign_invader: '外族入侵者',
  ancient_monster: '上古妖魔',
  corporate_tycoon: '商业巨鳄',
  political_opponent: '政敌',
  custom: '自定义',
}

/** NPC 反派扩展字段 */
export interface NPCAntagonistExtension {
  /** 是否为反派 */
  isAntagonist: boolean
  /** 反派标签列表 */
  antagonistTags: AntagonistTag[]
  /** 威胁等级 (0-100) */
  threatLevel: number
  /** 反派动机描述（AI 开局适配） */
  motivation: string
  /** 是否已首次交锋 */
  firstEncountered: boolean
  /** 被击败次数 */
  defeatCount: number
  /** 卷土重来概率 (0-1) */
  comebackProbability: number
  /** 与主角的冲突阶段 */
  conflictPhase: '潜伏中' | '试探中' | '对峙中' | '决战中' | '已击败' | '已消灭'
}

/** 单次行为记录 */
export interface NPCBehaviorRecord {
  id: string
  type: NPCBehaviorType
  description: string
  targetId?: string
  /** 触发年份 */
  year: number
  /** 行为结果 */
  result: string
}

/** NPC 间关系 */
export interface NPCRelation {
  /** 目标 NPC / 角色 ID */
  targetId: string
  /** 好感度 (-100 ~ 100) */
  affinity: number
  /** 关系类型 */
  type: 'friend' | 'enemy' | 'rival' | 'neutral' | 'family' | 'master' | 'disciple'
  /** 关系简述 */
  description: string
  /** 最近互动年份 */
  lastInteractionYear: number
}

// ============================================================
// NPC 记忆类型
// ============================================================

/** 记忆重要性等级 */
export type MemoryImportance = 'trivial' | 'minor' | 'notable' | 'major' | 'critical'

/** 单条 NPC 记忆 */
export interface NPCMemory {
  id: string
  /** 记忆关键词（用于检索和摘要） */
  keywords: string[]
  /** 记忆摘要文本 */
  summary: string
  /** 详细描述 */
  detail: string
  /** 重要性等级 */
  importance: MemoryImportance
  /** 创建年份 */
  createdYear: number
  /** 相关对象 ID（角色/NPC/地点） */
  relatedId?: string
  /** 情绪色彩 (-10 负面 ~ +10 正面) */
  emotionValence: number
  /** 衰减系数（每过 10 年，importance 降一级） */
  decayRate: number
}

/** 记忆重要性 → 保留年份 */
export const MEMORY_RETENTION: Record<MemoryImportance, number> = {
  trivial: 5,
  minor: 15,
  notable: 30,
  major: 60,
  critical: 120,
}

/** 记忆重要性 → 摘要长度上限（字符数） */
export const MEMORY_SUMMARY_LIMITS: Record<MemoryImportance, number> = {
  trivial: 20,
  minor: 50,
  notable: 100,
  major: 200,
  critical: 400,
}

// ============================================================
// NPC 完整状态
// ============================================================

/** NPC 完整状态 */
export interface NPCState {
  /** 唯一标识 */
  id: string
  /** NPC 名称 */
  name: string
  /** 性别 */
  gender: 'male' | 'female'
  /** 年龄 */
  age: number
  /** 出生年份 */
  birthYear: number
  /** 是否存活 */
  alive: boolean
  /** 死亡年份 */
  deathYear?: number
  /** 属性 */
  attributes: NPCAttributes
  /** 性格 */
  personality: NPCPersonality
  /** 最近行为记录（最多保留 20 条） */
  recentBehaviors: NPCBehaviorRecord[]
  /** 关系网络 */
  relations: NPCRelation[]
  /** 记忆链 */
  memories: NPCMemory[]
  /** 当前行为 */
  currentBehavior: NPCBehaviorType
  /** 当前所在地（区域 ID） */
  location: string
  /** 所属势力/faction */
  faction?: string
  /** 是否关键 NPC（关键 NPC 在重要事件时可调用 AI） */
  isKeyNPC: boolean
  /** 反派扩展（非反派为 null） */
  antagonist: NPCAntagonistExtension | null
}

/** NPC 摘要（注入 Prompt 的轻量版本） */
export interface NPCSummary {
  id: string
  name: string
  alive: boolean
  age: number
  /** 简短描述（1-2 句话） */
  description: string
  /** 与玩家的关系简述 */
  relationToPlayer: string
}

// ============================================================
// NPC 子系统汇总
// ============================================================

/** NPC 系统汇总（注入 Prompt） */
export interface NPCSystemSummary {
  totalNPCs: number
  aliveNPCs: number
  keyNPCs: NPCSummary[]
  recentEvents: string[]
}
