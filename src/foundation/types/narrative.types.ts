/**
 * @module narrative.types.ts
 * @description 叙事相关类型 —— Prompt 模板、构建上下文
 * @mod foundation
 *
 * 规范来源：mod-specification.md §8 AI Prompt 规范
 */

import type { ZodSchema } from 'zod'
import type { ContextCapabilityProfile, SimulationScope, WorldContextKind } from '../subsystem-contracts'
import type { ExecutionPhase } from './execution-sequence.types'

/** 世界设定 */
export interface WorldSetting {
  /** 当前上下文稳定 ID */
  contextId: string
  /** 当前上下文类型 */
  contextKind: WorldContextKind
  /** 当前上下文模拟范围 */
  simulationScope: SimulationScope
  /** 当前上下文能力画像 */
  capabilityProfile: ContextCapabilityProfile
  /** 世界名称 */
  name: string
  /** 世界描述 */
  description: string
  /** 时代 */
  era: string
  /** 基础世界观配置 */
  config: Record<string, unknown>,
}

/** 注入叙事 Prompt 的命格/特征摘要 */
export interface CharacterDestinyPatternSummary {
  name: string
  description: string
  effect?: string
  rarity?: string
  polarity?: string
}

/** 角色状态 */
export interface CharacterState {
  /** 存档内稳定的全局角色实体 ID */
  characterId: string
  /** 角色名称 */
  name: string
  /** 年龄 */
  age: number
  /** 性别 */
  gender: string
  /** 背景故事 */
  background: string
  /** 角色属性 */
  attributes: Record<string, unknown>
  /** 玩家选定的命格/特征（开局注入 AI） */
  destinyPatterns?: CharacterDestinyPatternSummary[],
}

/** Prompt 构建上下文 */
export interface PromptContext {
  /** 主叙事 AI 的精简中文世界视图 */
  worldNarrativeView: Record<string, unknown>,
  /** 主叙事 AI 的本局稳定中文角色档案 */
  characterProfileView: Record<string, unknown>,
  /** 主叙事 AI 的每轮中文角色现状 */
  characterStatusView: Record<string, unknown>,
  /** 子系统状态摘要（各子系统 summary 字符串数组） */
  subsystemSummaries: string[],
  /** 本轮系统引导来源：本地编译器负责排序、去重后发送 */
  roundSystemGuidanceText?: string,
  /** 玩家原始分支意图投影；与系统引导分段发送且不在编译时改写 */
  playerBranchIntent?: Record<string, unknown>,
  /** 事件注入文本（本轮检测到的系统事件，含生命周期状态） */
  eventInjectionText?: string,
  /** 大步进时间桥接摘要（year×N 中间年份断层补全） */
  timeBridgeSummary?: string,
  /** 系统变化摘要（与前轮对比的缩写快照差异） */
  systemChangeSummary?: string,
  /** 叙事引导文本（每轮动态变化：连贯性/生命阶段/原型/寿命/影响力/滑动窗口/NPC网络） */
  narrativeGuidanceText?: string,
  /** 世界观标签文本 */
  worldTagsText?: string,
  /** 世界规则文本（根据世界观本质动态注入的叙事规则） */
  worldRules?: string,
  /** 主叙事唯一记忆投影：按时间阶段排序，每个事件独立换行。 */
  timelineMemory?: string,
  /** 叙事风格（从用户设置读取，如：默认/史诗/写实/诗意） */
  narrativeStyle?: string,
  /** Step 0 叙事语气提示（校准 styleGuide.narrativeTone 映射，≤30 字） */
  narrativeToneHint?: string,
  /** MOD 声明的世界观规则文本（聚合自各 MOD 的 manifest.worldRules） */
  modWorldRules?: string,
  /** 情节结构引导文本（当前阶段 + 张力 + 叙事建议） */
  plotStructureText?: string,
  /** 伏笔追踪文本（待回收伏笔列表 + 回收提示） */
  foreshadowingText?: string,
  /** 字数约束指令（由用户设置的大致字数目标生成） */
  wordCountInstruction?: string,
  /** Step 0 世界校准摘要（稳定前缀，稀疏 modifier 偏离项） */
  calibrationSummary?: string,
  /** 待兑现因果链提示（causal-simulation 队列，Phase 7D-4） */
  causalChainHint?: string,
  /** 当前叙事时间（对齐废弃项目「时间」字段，如 "1991年 · 春"） */
  currentTime?: string,
  /** 已装备轮回天赋与普通命格的有序规则文本 */
  talents?: string,
  /** 时间描写引导（totalRounds > 0 时注入，指导 AI 避免"这一年"开头） */
  timeGuideText?: string,
  /** 当前世界力量框架的只读投影；不含跨世界固定阶位表。 */
  powerFramework?: string,
}

/**
 * Prompt 模板
 *
 * 规范来源：mod-specification.md §8.1 PromptTemplate 接口
 */
export interface PromptTemplate<TOutput = unknown> {
  /** 模板名称（kebab-case） */
  name: string
  /** 模板版本号 */
  version: string
  /** 所属 MOD 名称 */
  mod: string
  /** 系统 Prompt（角色设定 + 输出规则） */
  systemPrompt: string
  /** 服务端固定 Prompt 资产 ID；存在时浏览器不得携带 system 消息。 */
  serverPromptAssetId?: string
  /** 用户 Prompt 模板（支持 {{variable}} 占位符） */
  userPromptTemplate: string
  /** 模板变量列表（对应 userPromptTemplate 中的占位符） */
  variables: string[]
  /** 输出格式 */
  outputFormat: 'json' | 'text' | 'markdown'
  /** 输出结构校验 Schema（Zod），outputFormat='json' 时必填 */
  outputSchema?: ZodSchema<TOutput>
}

// ============================================================
// 全局难度系统
// ============================================================

/** 游戏难度等级 */
export type DifficultyLevel = 'normal' | 'hard' | 'nightmare' | 'hell'

/** 难度等级中文标签 */
export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  normal: '普通',
  hard: '困难',
  nightmare: '噩梦',
  hell: '地狱',
}

/** 难度等级描述 */
export const DIFFICULTY_DESCRIPTIONS: Record<DifficultyLevel, string> = {
  normal: '标准体验，所有系统按默认速率运转',
  hard: '恢复速率降至 85%，衰减速率升至 130%',
  nightmare: '恢复速率降至 70%，衰减速率升至 170%',
  hell: '恢复速率降至 50%，衰减速率升至 200%',
}

/** 健康类子系统难度乘数（恢复速率缩放） */
export const DIFFICULTY_MULTIPLIERS_HEALTH: Record<DifficultyLevel, number> = {
  normal: 1.0,
  hard: 0.85,
  nightmare: 0.7,
  hell: 0.5,
}

/** 机缘类子系统难度乘数（触发概率缩放） */
export const DIFFICULTY_MULTIPLIERS_FORTUNE: Record<DifficultyLevel, number> = {
  normal: 1.0,
  hard: 0.8,
  nightmare: 0.5,
  hell: 0.3,
}

// ============================================================
// Summary Compressor 相关类型
// 来源: summary-compressor-spec.md §3 完整数据结构
// ============================================================

/** 摘要压缩级别：L1=4轮、L2=16轮、L3=64轮。 */
export type SummaryLevel = 1 | 2 | 3

/** 压缩系统拥有的时间轴记忆事件。 */
export interface CompressedMemoryEvent {
  /** 存档内稳定事件 ID。 */
  id: string
  /** 该行所属时间段。 */
  timeSpan: string
  /** 客观事件说明。 */
  text: string
  /** 事件实际发生或被发送记录的时间。 */
  occurrenceTime: string
  /** 本事件覆盖的直接来源事件 ID。 */
  sourceEventIds: string[]
  /** 本事件覆盖的原始轮次。 */
  sourceRounds: number[]
  /** 初始权重 1~10；10 永久不衰减。 */
  initialWeight: number
  /** 当前衰减算法的起算轮。更高层压缩不得重置它。 */
  weightAnchorRound: number
  /** 权重 10 的最初 L1 原文事件，后续层级只能原样携带。 */
  permanent: boolean
}

/** 压缩后的摘要条目 */
export interface CompressedSummaryItem {
  /** 压缩级别 */
  level: SummaryLevel
  /** 覆盖的起始轮次（1-based） */
  startRound: number
  /** 覆盖的结束轮次（1-based） */
  endRound: number
  /** 压缩后的文本内容 */
  content: string,
  /** 压缩系统的结构化时间轴事件；旧存档可缺失。 */
  memoryEvents?: CompressedMemoryEvent[]
  /** 建立该节点的模型原始返回，供存档级明文数据库补写。 */
  rawCompressionResponse?: string
  /** L1 建立时包含权重 1 的完整时间轴档案文本；常驻 Prompt 可再按衰减过滤。 */
  archiveContent?: string
  /** 直接来源摘要节点 ID。 */
  sourceSummaryIds?: string[]
  /** 节点建立时已完成的轮次。 */
  createdRound?: number
  /** 摘要覆盖的上下文集合；旧存档缺失时按当前上下文兼容 */
  contextIds?: string[]
  /** 摘要覆盖的规范全局时间范围 */
  startTotalDays?: number
  endTotalDays?: number
}

/** 压缩摘要集合 */
export interface CompressedSummaries {
  summaries: CompressedSummaryItem[],
}

/** 死亡原因 */
export interface DeathCause {
  reason: string
  round: number,
}

/** 世界方向记录 */
export interface WorldDirectionRecord {
  political?: string,
  economic?: string,
  military?: string,
  cultural?: string,
  environmental?: string,
}

/** 叙事事件（压缩器核心输入） */
export interface YearEventKeyEvent {
  /** AI 对事件的精简描述 */
  text: string
  /** AI 给出的 0—100 事件重要性；用于压缩保留优先级 */
  importance: number
  /** AI 明确标注的人物、地点、物品或组织 */
  entities?: string[]
}

export interface YearEvent {
  id: number,
  /** 事件发生上下文 */
  contextId?: string,
  /** 事件对应的规范全局累计天数 */
  totalDays?: number,
  age: number,
  totalMonths: number,
  eraYear: number,
  eraName: string,
  displayEraName?: string,
  displayEraYear?: number,
  narrative: string,
  /** AI 每轮返回的一句话故事压缩字段 */
  digest?: string,
  /** AI 每轮返回的带权事件列表 */
  keyEvents?: YearEventKeyEvent[],
  /** AI 对整轮叙事的粗粒度重要性 */
  importance?: 'HIGH' | 'NORMAL' | 'LOW',
  timeLabel: string,
  dynamicAttrs?: Record<string, number>,
  baseAttrChanges?: Record<string, number>,
  isTimeSkip?: boolean,
  timeSkipYears?: number,
  isBranchPoint?: boolean,
  branchTitle?: string,
  branchOptions?: string[],
  isEnding?: boolean,
  deathCause?: DeathCause,
  worldDirection?: WorldDirectionRecord,
}

/** 长期记忆 */
export interface LongTermMemory {
  spouse?: { name: string; sinceRound: number; relationQuality: number; entityId?: string; contextId?: string }
  children?: Array<{ name: string; age: number; gender: string; entityId?: string; contextId?: string }>
  parents?: {
    father?: { name: string; age: number; isAlive: boolean }
    mother?: { name: string; age: number; isAlive: boolean }
  }
  faction?: { name: string; role: string; rank: number }
  titles?: string[]
  majorEvents: Array<{ round: number; description: string; category: string; contextId?: string }>
  relationships: Array<{ name: string; relation: string; quality: number; entityId?: string; contextId?: string }>
  locations?: string[]
  locationContexts?: Record<string, string>
  currentContextId?: string
  wealth?: { description: string; level: number }
  reputation?: Record<string, number>
  lastUpdated?: number
}

/** 叙事方向 */
export type NarrativeDirection =
  | '战斗/征服'
  | '经商/积累'
  | '修炼/突破'
  | '社交/结盟'
  | '探索/冒险'
  | '经营/建设'
  | '学习/研究'
  | '日常/生活'
  | null

// ============================================================
// 世界观禁用检测
// 来源: life-sim-shared.ts — FORBIDDEN_ACTION_PATTERNS
// ============================================================

/** 世界观禁用动作模式 */
export interface ForbiddenActionPattern {
  directionKeywords: string[],
  playerInputPatterns: RegExp[],
  aiHardConstraint: string,
}

/** 按世界观配置的禁用动作模式 */
export const FORBIDDEN_ACTION_PATTERNS: Record<string, ForbiddenActionPattern> = {
  materialist: {
    directionKeywords: [
      '修仙', '修真', '魔法', '灵气', '修炼', '法术',
      '异能', '超凡', '神力', '仙术', '道术', '巫术',
      '魂力', '感应预知', '仙人托梦', '天降异象', '法宝',
    ],
    playerInputPatterns: [
      /修仙|修真|魔法|灵气|修炼|法术|异能|超凡|神力|仙术|道术|巫术|魂力|感应预知|仙人托梦|天降异象|法宝/i,
    ],
    aiHardConstraint: '禁止在叙事中出现任何超自然、修仙、魔法、灵气相关内容',
  },
}

// ============================================================
// 内容安全声明
// 来源: life-sim-shared.ts
// ============================================================

/** 内容安全声明 */
export const SAFETY_GUIDE = '【内容说明】本程序为虚构文字娱乐，所有内容均为虚构世界中的故事，请勿与现实世界关联。请避免涉及现实政治、敏感事件及人物。'

// ============================================================
// NarrativeStage 叙事状态机（吸收 Factorio Story Script 系统）
// 来源: blueprint-final.md §改造 13
// ============================================================

/**
 * 叙事阶段
 *
 * 吸收 Factorio Story Script 的 4 阶段事件模型：
 *
 *   init(进入时执行一次) → update(每轮执行)
 *     → condition(判断是否可前进) → action(离开时执行一次)
 *     → 下一阶段
 *
 * | Factorio         | 本项目映射            |
 * |------------------|----------------------|
 * | init             | onEnter              |
 * | update           | onUpdate             |
 * | condition        | shouldProceed        |
 * | action           | onExit               |
 * | branch           | stages 数组（顺序执行） |
 * | story_jump_to    | jumpTo（可选）        |
 */
export interface NarrativeStage {
  /** 阶段名称 */
  name: string

  /** 执行图阶段；阶段屏障不得逆向依赖。 */
  phase: ExecutionPhase

  /** 硬依赖阶段名称。 */
  dependsOn: readonly string[]

  /** 同一依赖层的显式顺序。 */
  order: number

  /** 同阶段、同依赖层、同 order 的显式并行组。 */
  parallelGroup?: string

  /** 阶段实现与诊断的唯一所有者。 */
  owner: string

  /** 阶段故障的唯一接收者。 */
  failureTarget: string

  /** 进入阶段时执行一次 */
  onEnter?: (ctx: import('./subsystem.types').RoundContext) => void | Promise<void>

  /** 每轮执行 */
  onUpdate?: (ctx: import('./subsystem.types').RoundContext) => void | Promise<void>

  /** 判断阶段是否完成（返回 true → 进入下一阶段） */
  shouldProceed?: (ctx: import('./subsystem.types').RoundContext) => boolean | Promise<boolean>

  /** 离开阶段时执行一次 */
  onExit?: (ctx: import('./subsystem.types').RoundContext) => void | Promise<void>

  /**
   * 可选：阶段执行次数上限；超过后进入失败终态
   *
   * 替代手动 deadLoopDetector 计数器。当 onUpdate 执行次数达到 maxRounds
   * 且 shouldProceed 未返回 true 时，引擎终止当前执行实例，不猜测成功。
   */
  maxRounds?: number
}

/**
 * 叙事阶段机
 *
 * 自动管理阶段流转：
 *   1. 按阶段声明的执行图顺序逐阶段执行
 *   2. 每轮调用当前阶段的 onUpdate()
 *   3. 检查 shouldProceed() → true → 调用 onExit() → 进入下一阶段
 *   4. 支持 jumpTo(stageName) 跳转到其他分支
 *   5. 自动检查 maxRounds 防止死循环，超限进入失败终态
 */
export interface NarrativeStageMachine {
  /** 阶段数组（顺序执行） */
  stages: NarrativeStage[]

  /** 当前阶段索引 */
  currentIndex: number

  /** 当前阶段已执行轮次数（用于 maxRounds 检测） */
  roundCount: number

  /** 执行当前阶段 */
  executeCurrentStage(context: import('./subsystem.types').RoundContext): void

  /** 跳转到指定阶段（支持分支） */
  jumpTo(stageName: string): void

  /** 是否已完成所有阶段 */
  isFinished(): boolean
}

