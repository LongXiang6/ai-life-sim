/**
 * @module types.ts
 * @description mod-history-dynamics 类型定义 —— 事件池、因果模拟
 * @mod mod-history-dynamics
 */

// ============================================================
// §1 事件池
// ============================================================

/** 事件来源 */
export type EventSource = 'ai' | 'preset'

/** 事件池条目 */
export interface EventPoolEntry {
  id: string
  /** 事件名称 */
  name: string
  /** 事件描述 */
  description: string
  /** 来源 */
  source: EventSource
  /** 触发条件 */
  triggerCondition: string
  /** 触发窗口 [起始年, 结束年] */
  triggerWindow: [number, number]
  /** 影响范围 */
  affectedRegions: string[]
  /** 严重程度 0-100 */
  severity: number
  /** 是否已触发 */
  triggered: boolean
  /** 触发年份（0=未触发） */
  triggeredYear: number
  /** 是否已过期 */
  expired: boolean,
}

/** 事件池子系统状态 */
export interface EventPoolState {
  /** 所有条目 */
  entries: EventPoolEntry[]
  /** 预设池已用索引 */
  presetUsedIndices: number[]
  /** 上次清理年份 */
  lastCleanupYear: number,
}

// ============================================================
// §2 因果模拟
// ============================================================

/** 因果行为类型 */
export type CausalActionType =
  | 'war_attack'       // 发动战争
  | 'assassination'    // 暗杀
  | 'rebellion'        // 叛乱
  | 'betrayal'         // 背叛
  | 'alliance_form'    // 结盟
  | 'trade_embargo'    // 贸易封锁
  | 'cultural_export'  // 文化输出
  | 'discovery'        // 大发现

/** 因果事件 */
export interface CausalEvent {
  id: string
  /** 行为类型 */
  actionType: CausalActionType
  /** 捕获描述 */
  captureDescription: string
  /** 发起方 */
  initiator: string
  /** 目标方 */
  target: string
  /** 捕获年份 */
  captureYear: number
  /** 延时触发年份 */
  triggerYear: number
  /** 已解析的后果描述 */
  consequence: string
  /** 是否已解决 */
  resolved: boolean,
}

/** 因果队列 */
export interface CausalQueue {
  /** 待处理队列 */
  pending: CausalEvent[]
  /** 已处理历史 */
  resolved: CausalEvent[]
  /** 频率限制: 每 10 年计数 */
  recentDecadeCount: number
  /** 频率限制: 每 30 年计数 */
  recent30YearCount: number,
}

/** 因果模拟子系统状态 */
export interface CausalSimulationState {
  queue: CausalQueue
  /** 上次处理年份 */
  lastProcessYear: number,
}

// ============================================================
// §3 Store 聚合类型
// ============================================================

export interface HistoryDynamicsSummary {
  eventPool: EventPoolState
  causalSimulation: CausalSimulationState,
}

