/**
 * @module pre-gen-config.ts
 * @description 预生成系统配置常量 —— 空闲时预生成下一轮叙事
 * @mod mod-engine
 *
 * 来源：废弃项目 pages/game-simulation/useSimulationPreGen.ts
 *
 * 机制：
 *   - 空闲时预生成后续事件
 *   - 缓存到 cacheStore
 *   - 用户推进时直接使用预生成结果
 */

import { cacheStore } from '@/core'

/** 预生成缓存键（cacheStore 内 key） */
const PRE_GEN_CACHE_KEY = 'pre-gen-result'

/** 预生成状态键（cacheStore 内 key） */
const PRE_GEN_STATUS_KEY = 'pre-gen-status'

/** 预生成状态 */
export type PreGenStatus = 'idle' | 'generating' | 'ready' | 'error'

/** 预生成缓存数据结构 */
export interface PreGenCache {
  /** 预生成的叙事文本 */
  narrative: string
  /** 预生成时间戳 */
  timestamp: number
  /** 对应的回合数 */
  round: number
  /** 使用的 seed */
  seed?: number
}

/** 预生成配置 */
export const PRE_GEN_CONFIG = {
  /** 预生成超时时间（毫秒） */
  TIMEOUT_MS: 30000,
  /** 缓存有效期（毫秒）5 分钟 */
  CACHE_TTL_MS: 300000,
  /** 最大重试次数 */
  MAX_RETRY: 2,
  /** 重试延迟（毫秒） */
  RETRY_DELAY_MS: 2000,
} as const

/**
 * 保存预生成结果到 cacheStore
 */
export function savePreGenResult(cache: PreGenCache): void {
  try {
    cacheStore.set('mod-engine', PRE_GEN_CACHE_KEY, cache)
    cacheStore.set('mod-engine', PRE_GEN_STATUS_KEY, 'ready' as PreGenStatus)
  } catch {
    // cacheStore 不可用时静默忽略
  }
}

/**
 * 读取预生成结果
 */
export function loadPreGenResult(): PreGenCache | null {
  try {
    const cache = cacheStore.get<PreGenCache>('mod-engine', PRE_GEN_CACHE_KEY)
    if (!cache) return null
    // 检查是否过期
    if (Date.now() - cache.timestamp > PRE_GEN_CONFIG.CACHE_TTL_MS) {
      clearPreGenResult()
      return null
    }
    return cache
  } catch {
    return null
  }
}

/**
 * 清理预生成结果
 */
export function clearPreGenResult(): void {
  try {
    cacheStore.remove('mod-engine', PRE_GEN_CACHE_KEY)
    cacheStore.set('mod-engine', PRE_GEN_STATUS_KEY, 'idle' as PreGenStatus)
  } catch {
    // cacheStore 不可用时静默忽略
  }
}

/**
 * 获取预生成状态
 */
export function getPreGenStatus(): PreGenStatus {
  try {
    return cacheStore.get<PreGenStatus>('mod-engine', PRE_GEN_STATUS_KEY) ?? 'idle'
  } catch {
    return 'idle'
  }
}

/**
 * 设置预生成状态
 */
export function setPreGenStatus(status: PreGenStatus): void {
  try {
    cacheStore.set('mod-engine', PRE_GEN_STATUS_KEY, status)
  } catch {
    // cacheStore 不可用时静默忽略
  }
}
