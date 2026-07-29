/**
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
import type { NarrativeIntentResolution } from './helpers/narrative-semantic-signals'
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
  /** 从纪元起点（year=0,day=1）累计的绝对天数，单调递增，用于防倒退校验 */
  totalDays: number
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
  maxRounds: number
  temperature: number
  maxTokens: number,
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
  /** 重置信号：AI 重试/降级时通知 UI 丢弃上一次尝试已累积的流式文本，避免拼接重复 */
  isReset?: boolean,
  /** 命运分叉点 */
  isBranchPoint?: boolean,
  branchTitle?: string,
  branchOptions?: string[],
  /** 玩家已确认的分支选择 */
  resolvedChoice?: string,
  /** 玩家实际确认该选择时的回合；旧存档缺失时回退到原分支条目轮次。 */
  resolvedChoiceRound?: number,
  /** 本轮对当前命运意图的结构化执行结果。 */
  intentResolution?: NarrativeIntentResolution,
  /** 该条叙事写入时的角色年龄（快照） */
  displayAge?: number,
  /** 该条叙事写入时的纪元/时间标签（快照） */
  displayTimeLabel?: string,
  /** 该条叙事对应的属性变化（用于 UI 展示） */
  attrChanges?: Array<{ icon: string; label: string; change: number }>,
  /** 本轮故事与最近完整历史的重复率观测；只用于质量统计，不裁剪正文。 */
  repetitionMetric?: NarrativeRepetitionMetric,
  /** 本轮状态迁移审计；用于结算复算，不进入 AI Prompt。 */
  transitionAudit?: NarrativeTransitionAuditSnapshot,
}

/** 压缩统计 */
export interface CompressionStats {
  l1Count: number
  l2Count: number
  l3Count: number
  lastAt: number,
}

/** 角色创造追踪 — 防止 AI 将自创内容改写为遗迹来源 */
export interface CharacterCreation {
  /** 名称（2-8字） */
  name: string
  /** 简述 */
  description: string
  /** 类型 */
  category: 'power_system' | 'technique' | 'ability' | 'rule' | 'object' | 'other'
  /** 确认轮次 */
  confirmedRound: number
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
  /** 角色已开创的内容清单（防止 AI 改写为遗迹来源） */
  characterCreations: CharacterCreation[]
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
  /** 本轮经完整 META 与状态提交共同验证的命运意图结果。 */
  intentResolution?: NarrativeIntentResolution
}

