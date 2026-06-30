/**
 * @module degradation-manager.ts
 * @description 降级管理器 —— 按优先级串联解析策略，统一管理降级统计
 * @mod mod-engine
 *
 * 职责：
 *   - 持有 ParseStrategy 列表（按注册顺序即优先级顺序）
 *   - 串联调用策略，首个成功即返回
 *   - 统计各层降级次数
 *   - 全部失败返回空 ParsedNarrative（L3 降级）
 */

import type { ParsedNarrative } from '../subsystems/narrative-parser-system'
import type { ChineseTextProcessor } from './chinese-text-processor'
import type { ParseStrategy } from './parse-strategies'

/** 降级统计 */
export interface DegradationStats {
  l0Success: number
  l1Fallback: number
  l2Fallback: number
  l3Empty: number
  totalCalls: number,
}

/** 初始降级统计（全零） */
export function createInitialStats(): DegradationStats {
  return { l0Success: 0, l1Fallback: 0, l2Fallback: 0, l3Empty: 0, totalCalls: 0 }
}

export class DegradationManager {
  private strategies: ParseStrategy[]
  private stats: DegradationStats

  constructor(strategies: ParseStrategy[]) {
    this.strategies = strategies
    this.stats = createInitialStats()
  }

  /**
   * 按策略优先级依次尝试解析
   * 全部失败返回空 narrative（L3 降级）
   */
  parse(content: string, processor: ChineseTextProcessor): ParsedNarrative {
    this.stats.totalCalls++

    for (let i = 0; i < this.strategies.length; i++) {
      const result = this.strategies[i].parse(content, processor)
      if (result) {
        this.recordSuccess(i)
        return result
      }
    }

    // L3: 彻底失败
    this.stats.l3Empty++
    return { narrative: '', changes: [], notableEvents: [] }
  }

  /** 获取降级统计（只读副本） */
  getStats(): Readonly<DegradationStats> {
    return { ...this.stats }
  }

  /** 重置降级统计 */
  reset(): void {
    this.stats = createInitialStats()
  }

  private recordSuccess(level: number): void {
    if (level === 0) this.stats.l0Success++
    else if (level === 1) this.stats.l1Fallback++
    else if (level >= 2) this.stats.l2Fallback++
  }
}

