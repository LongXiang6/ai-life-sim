/**
 * Purpose: Define shared mod-engine runtime and persistence types.
 * Owner: mod-engine
 * Responsibility: Describe engine contracts only; behavior and state transitions remain with their owning systems.
 *
 * @module types.ts
 * @description MOD 类型定义 —— 引擎核心类型（含压缩）
 * @mod mod-engine
 *
 * 历法：12月 真实公历分布（31/28/31/30/31/30/31/31/30/31/30/31） = 365天 = 1年
 * 四季：按阳历月份区间划分（3–5月春/6–8月夏/9–11月秋/12–2月冬）
 */

import type {
  TimeStep,
  CompressedSummaries,
  NarrativeTransitionAuditSnapshot,
} from '@/foundation'
import type { NarrativeRepetitionMetric, NarrativeRepetitionSummary } from './helpers/narrative-repetition-metrics'
import type { LegendaryEncounterProjection } from '@/core/player-content/player-content-contract'

export type { TimeStep, }

/** 回合信息 */
export interface RoundInfo {
  year: number
  season: number
  month: number
  day: number
  dayOfYear: number
  /** 从基础点派生的绝对日历天数；仅用于日期显示与旧存档兼容。 */
  totalDays: number
  /** 每年1000点制的绝对基础点；totalDays由此派生。 */
  totalBasePoints: number
  /** 最近一次推进消费的基础点，仅用于运行态投影。 */
  basePointsPassed?: number
  /** 事件节点模式下，本自然年配置的叙事节点预算；旧日/月/季/年存档可省略。 */
  eventNodeCount?: number
  /** 事件节点模式下，本自然年已经消费的节点数（0 到 eventNodeCount）；旧存档可省略。 */
  eventNodeIndex?: number
  /** 当前纪元名称（如"神话纪元"） */
  eraName: string,
  /** 当前纪元内的年数（从 1 开始） */
  eraYear: number,
  /** 年号（如"洪武"） */
  reignTitle: string,
  /** 年号内的年数（从 1 开始） */
  reignYear: number,
}

/** 模拟状态 */
export type SimulationStatus = 'idle' | 'running' | 'paused' | 'complete'

/** 引擎配置 */
export interface EngineConfig {
  model: string
  timeStep: TimeStep
  temperature: number
}

export type NarrativeDestinyPatternGrowthRarity = 'common' | 'fine' | 'rare' | 'epic' | 'legendary' | 'mythic'

export interface NarrativeDestinyPatternGrowthPattern {
  name: string
  rarity: NarrativeDestinyPatternGrowthRarity
  description: string
  effect: string
  attrBonus: Partial<Record<'physique' | 'mind' | 'talentAptitude' | 'charisma' | 'luck', number>>
}

export interface NarrativeDestinyPatternGrowthOption extends NarrativeDestinyPatternGrowthPattern {
  optionId: string
  route: '深度强化' | '广度强化' | '转变强化'
}

/** 命格系统提交到故事条目中的只读成长展示投影。 */
export interface NarrativeDestinyPatternGrowthProjection {
  choiceId: string
  lineageId: string
  source: NarrativeDestinyPatternGrowthPattern
  options: [
    NarrativeDestinyPatternGrowthOption,
    NarrativeDestinyPatternGrowthOption,
    NarrativeDestinyPatternGrowthOption,
  ]
  selectedOptionId?: string
  result?: NarrativeDestinyPatternGrowthPattern
}

/** 已提交的逐轮叙事记录 */
export interface NarrativeChunk {
  /** 唯一标识（生成时用 timestamp + 随机数填充，用于 resolveBranch 索引漂移防御） */
  id?: string,
  text: string
  isComplete: boolean
  timestamp: number,
  /** 本条叙事发生的稳定世界上下文 */
  contextId?: string,
  /** Prompt 读取作用域：当地事实、全局事实或随角色跨界携带的旅行记忆。 */
  memoryScope?: 'global' | 'context' | 'travel',
  /** 写入时的世界名称投影，便于旧记录阅读 */
  contextName?: string,
  /** 写入时规范全局累计天数 */
  totalDays?: number,
  /** 写入时年度基础点；业务时间真源，totalDays 仅为派生日历快照。 */
  totalBasePoints?: number,
  /** 重置信号：AI 重试/降级时通知 UI 丢弃上一次尝试已累积的流式文本，避免拼接重复 */
  isReset?: boolean,
  /** 命运分叉点 */
  isBranchPoint?: boolean,
  branchTitle?: string,
  branchOptions?: string[],
  /** 故事 AI 确认当前人生不再存在任何操作空间时给出的四字结局。 */
  endingTitle?: string,
  /** 玩家已确认的分支选择 */
  resolvedChoice?: string,
  /** 玩家实际确认该选择时的回合；旧存档缺失时回退到原分支条目轮次。 */
  resolvedChoiceRound?: number,
  /** 该条叙事写入时的角色年龄（快照） */
  displayAge?: number,
  /** 该条叙事写入时的纪元/时间标签（快照） */
  displayTimeLabel?: string,
  /** 本轮天赋成长的三选一或已确认结果；业务真源仍属于 mod-character。 */
  destinyPatternGrowth?: NarrativeDestinyPatternGrowthProjection,
  /** 本轮故事与最近完整历史的重复率观测；只用于质量统计，不裁剪正文。 */
  repetitionMetric?: NarrativeRepetitionMetric,
  /** 本轮状态迁移审计；用于结算复算，不进入 AI Prompt。 */
  transitionAudit?: NarrativeTransitionAuditSnapshot,
}

/** 压缩统计 */
export interface CompressionStats {
  compressedRoundCount: number
  lastSourceRound: number | null
  lastCompletedAt: number
}

/** 引擎状态 */
export interface EngineState {
  /** 不含账号信息的本局不透明标识，用于重复率指标归并。 */
  lifeRunId: string
  status: SimulationStatus
  round: RoundInfo
  timeStep: TimeStep
  totalRounds: number
  narrativeHistory: NarrativeChunk[]
  currentNarrative: string
  compressionStats: CompressionStats
  compressedSummaries: CompressedSummaries
  /** 上次自动保存的回合数（0 表示尚未自动保存） */
  lastAutoSaveRound: number
  /** 本局故事重复率的持久化聚合快照。 */
  storyRepetitionStats: NarrativeRepetitionSummary
  /** 本局抽中的低频跨世界传奇；只作为一次性低优先级叙事素材。 */
  legendaryEncounter?: LegendaryEncounterProjection & {
    status: 'selected' | 'injected'
    injectedRound?: number
  }
  /** 防止同一局在没有抽中时反复请求。 */
  legendaryEncounterCheckedForLifeRunId?: string
}

/** 回合结果 */
export interface RoundResult {
  narrative: string
  changes: Array<{ id: string; description: string; changes: Record<string, unknown> }>
  notableEvents: string[]
  /** AI 回复中的结构化世界方向指令（如 {market:{direction:"繁荣",magnitude:0.3}}），为空时由关键词检测兜底 */
  direction?: Record<string, { direction?: string; magnitude?: number }>
}
