/**
 * @module index
 * @description mod-history-dynamics 公共 API 导出
 * @mod mod-history-dynamics
 */

// === 类型 ===
export type {
  EventSource,
  EventPoolEntry,
  EventPoolState,
  CausalActionType,
  CausalEvent,
  CausalQueue,
  CausalSimulationState,
  HistoryDynamicsSummary,
} from './types'

// === 常量 ===
export {
  ROUND_DECIMALS,
  PRESET_EVENT_POOL,
  EVENT_POOL_REFRESH_INTERVAL,
  MAX_EVENT_POOL_SIZE,
  CAUSAL_ACTION_LABELS,
  CAUSAL_REGEX_RULES,
  MAX_CAUSAL_PER_DECADE,
  MAX_CAUSAL_PER_30_YEARS,
  CAUSAL_DELAY_RANGE,
} from './constants'

// === 工具函数 ===
export { round, clamp, pickRandom } from './utils'

// === Store ===
export { useHistoryDynamicsStore } from './store'

// === Hook ===
export { useEventPool, useCausalSimulation, useHistoryDynamics } from './hooks'
